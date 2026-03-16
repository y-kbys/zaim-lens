import time
import traceback
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Body, Depends, Request
from fastapi.responses import HTMLResponse
from services.auth import verify_token, verify_token_optional, verify_token_manually
from services.zaim_client import (
    ZAIM_CONSUMER_KEY, ZAIM_CONSUMER_SECRET, ZAIM_CALLBACK_URL,
    get_zaim_session_wrapper,
    get_zaim_authorization_params, exchange_zaim_access_token,
    fetch_zaim_accounts_raw, check_zaim_duplicate, 
    register_payment_item, fetch_history_with_categories
)
from schemas import (
    RegisterRequest, CopyRequest, ZaimAccount, ZaimCredentialsRequest, ZaimAccountUpdateRequest
)
from db import get_user_config, save_user_config, clear_zaim_master_data_db
from services.master_data_service import get_or_fetch_master_data
from services import zaim_service

router = APIRouter()

# Temporary in-memory cache for OAuth secrets to handle cross-domain cookie blocking in SPAs
OAUTH_SECRETS = {}

@router.get("/api/zaim/login")
async def zaim_login(request: Request, name: str = "デフォルト", idToken: str = None, user_id_dep: str = Depends(verify_token_optional)):
    print(f"DEBUG: zaim_login initiated. name={name}, has_idToken={bool(idToken)}, user_id_dep={user_id_dep}")
    
    # Use idToken from query if user_id_dep didn't resolve (e.g. standard redirect)
    user_id = user_id_dep
    if not user_id and idToken:
        try:
            user_id = verify_token_manually(idToken)
            print(f"DEBUG: zaim_login manual verify success. user_id={user_id}")
        except Exception as ve:
            print(f"DEBUG: zaim_login manual verify failed: {ve}")
            pass
            
    if not user_id:
        print("DEBUG: zaim_login failed: No user_id")
        raise HTTPException(status_code=401, detail="Authentication required")

    if not ZAIM_CONSUMER_KEY or not ZAIM_CONSUMER_SECRET:
        print("DEBUG: zaim_login failed: Missing ZAIM_CONSUMER_KEY or SECRET")
        raise HTTPException(status_code=500, detail="Zaim Consumer Key/Secret is missing in environment variables.")

    # Explicitly use ZAIM_CALLBACK_URL if provided, else rely on request.url_for
    callback_url = ZAIM_CALLBACK_URL
    if not callback_url:
        callback_uri = request.url_for('zaim_callback')
        callback_url = str(callback_uri)
        # Cloud Run / Proxy workaround: Force https if not localhost
        if "localhost" not in callback_url and callback_url.startswith("http://"):
            callback_url = callback_url.replace("http://", "https://", 1)
            
    print(f"DEBUG: zaim_login using callback_url={callback_url}")

    try:
        auth_params = get_zaim_authorization_params(callback_url)
        
        # Save request token secret in session to use it in callback
        request.session['user_id'] = user_id
        request.session['zaim_pending_user_id'] = user_id
        request.session['zaim_oauth_token_secret'] = auth_params["oauth_token_secret"]
        request.session['zaim_pending_name'] = name
        
        # Also save in global dictionary to survive strict SameSite cookie blocking
        oauth_token = auth_params["oauth_token"]
        if oauth_token:
            OAUTH_SECRETS[oauth_token] = {
                'secret': auth_params["oauth_token_secret"],
                'name': name,
                'user_id': user_id
            }
        
        print(f"DEBUG: zaim_login returning auth_url={auth_params['auth_url']}")
        return {"auth_url": auth_params["auth_url"]}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to initiate Zaim OAuth: {str(e)}")

@router.get("/api/zaim/callback")
async def zaim_callback(request: Request, oauth_token: str, oauth_verifier: str):
    # Try to load secrets from global dict first (bypasses cookie issues)
    secret_data = OAUTH_SECRETS.pop(oauth_token, None)
    if secret_data:
        request_token_secret = secret_data.get('secret')
        pending_name = secret_data.get('name', 'Zaim Account')
        user_id = secret_data.get('user_id')
    else:
        # Fallback to session
        request_token_secret = request.session.get('zaim_oauth_token_secret')
        pending_name = request.session.get('zaim_pending_name', 'Zaim Account')
        user_id = request.session.get('zaim_pending_user_id') or request.session.get('user_id')

    if not user_id:
        return HTMLResponse("<html><body><script>alert('Session lost. Please try again.'); window.location.href='/';</script></body></html>")

    if not request_token_secret:
        raise HTTPException(status_code=400, detail="OAuth request token secret missing in session.")

    try:
        token_res = exchange_zaim_access_token(oauth_token, request_token_secret, oauth_verifier)
        final_token = token_res.get('oauth_token')
        final_token_secret = token_res.get('oauth_token_secret')
        
        # Save to DB
        config = get_user_config(user_id)
        accounts = config.get("accounts", {})
        acct_id = None
        max_id = 0
        for aid, ainfo in accounts.items():
            try:
                numeric_id = int(aid)
                if numeric_id > max_id:
                    max_id = numeric_id
            except ValueError:
                pass
                
            if ainfo.get('name') == pending_name:
                acct_id = aid
                
        if not acct_id:
            acct_id = str(max_id + 1)

        accounts[acct_id] = {
            "id": acct_id,
            "name": pending_name,
            "token": final_token,
            "token_secret": final_token_secret
        }
        config["accounts"] = accounts
        save_user_config(user_id, config)
        
        # Clear sensitive session data
        request.session.pop('zaim_oauth_token_secret', None)
        request.session.pop('zaim_pending_name', None)
        request.session.pop('zaim_pending_user_id', None)
        
        return HTMLResponse("<html><body><script>window.location.href='/';</script></body></html>")
    except Exception as e:
        traceback.print_exc()
        return HTMLResponse(f"<html><body>OAuth failed: {str(e)} <a href='/'>Back</a></body></html>")

@router.get("/api/zaim/status")
async def get_zaim_status(user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    status_list = []
    for aid, ainfo in accounts.items():
        status_list.append({
            "id": aid,
            "name": ainfo.get("name", "Unknown"),
            "connected": True
        })
    return {"accounts": status_list}

@router.delete("/api/zaim/disconnect/{account_id}")
async def zaim_disconnect(account_id: str, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    if account_id in accounts:
        del accounts[account_id]
        config["accounts"] = accounts
        save_user_config(user_id, config)
        return {"status": "success"}
    else:
        raise HTTPException(status_code=404, detail="Account not found.")

@router.get("/api/zaim/accounts")
async def get_zaim_accounts(account_id: str = "1", user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    session = get_zaim_session_wrapper(account_id, user_id, config.get("accounts", {}))
    accounts = fetch_zaim_accounts_raw(session)
    return [ZaimAccount(id=a["id"], name=a["name"]) for a in accounts if a.get("active") != -1]

@router.get("/api/zaim/categories")
async def get_categories(account_id: str = "1", user_id: str = Depends(verify_token)):
    try:
        config = get_user_config(user_id)
        master_data = get_or_fetch_master_data(user_id, account_id, config.get("accounts", {}))
        
        return {
            "master_categories": master_data.get("categories", []),
            "master_genres": master_data.get("genres", [])
        }
    except Exception as e:
        print(f"Error fetching categories for {account_id} / {user_id}: {e}")
        traceback.print_exc()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/register")
async def register_to_zaim(request: RegisterRequest = Body(...), user_id: str = Depends(verify_token)):
    print(f"Starting Registration to Zaim. Items: {len(request.receipt_data.items)}")
    config = get_user_config(user_id)
    session = get_zaim_session_wrapper(request.target_account_id, user_id, config.get("accounts", {}))
    receipt_data = request.receipt_data

    if not request.force:
        total_amount = sum(item.price for item in receipt_data.items) - (receipt_data.point_usage or 0)
        if check_zaim_duplicate(session, receipt_data.date, total_amount):
            return {
                "status": "warning",
                "message": "重複の可能性がある支出が見つかりました（同一日付・同一金額）。",
                "duplicate_found": True
            }
    
    # Prepare items list
    items = []
    for item in receipt_data.items:
        items.append({
            "category_id": item.category_id,
            "genre_id": item.genre_id,
            "amount": item.price,
            "name": item.name
        })
    
    # Add point usage as a negative item if present
    if receipt_data.point_usage > 0:
        items.append({
            "category_id": receipt_data.items[0].category_id if len(receipt_data.items) > 0 else 101,
            "genre_id": receipt_data.items[0].genre_id if len(receipt_data.items) > 0 else 10101,
            "amount": -receipt_data.point_usage,
            "name": "ポイント利用"
        })

    success_count = zaim_service.register_receipt_items(
        session=session,
        items=items,
        date=receipt_data.date,
        store_name=receipt_data.store,
        from_account_id=request.from_account_id,
        receipt_id=request.receipt_id
    )
    
    return {
        "status": "success",
        "registered_count": success_count,
        "message": f"Successfully registered {success_count} items."
    }

@router.get("/api/accounts")
async def get_accounts(user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    accounts_list = []
    for acct_id, acct_data in accounts.items():
        accounts_list.append({
            "id": acct_id,
            "name": acct_data.get("name", "Unnamed Account")
        })
    return accounts_list

@router.get("/api/history")
async def get_history(account_id: str, period: Optional[int] = 30, start_date: Optional[str] = None, end_date: Optional[str] = None, user_id: str = Depends(verify_token)):
    try:
        config = get_user_config(user_id)
        session = get_zaim_session_wrapper(account_id, user_id, config.get("accounts", {}))
        import datetime as dt_module
        now = dt_module.datetime.now()
        
        if start_date and end_date:
            start_date_str = start_date
            end_date_str = end_date
        else:
            end_date_str = now.strftime("%Y-%m-%d")
            computed_start_date = now - dt_module.timedelta(days=period)
            start_date_str = computed_start_date.strftime("%Y-%m-%d")
        
        params = {
            "mapping": 1,
            "start_date": start_date_str,
            "end_date": end_date_str
        }
        
        master_data = get_or_fetch_master_data(user_id, account_id, config.get("accounts", {}))
        history = fetch_history_with_categories(session, master_data, params)
        return {"history": history}
    except Exception as e:
        print(f"Error in get_history: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/copy")
async def copy_history(request: CopyRequest = Body(...), user_id: str = Depends(verify_token)):
    try:
        print(f"Starting History Copy from Account {request.source_account_id} to Account {request.destination_account_id}. Items: {len(request.items_to_copy)}")
        config = get_user_config(user_id)
        dest_session = get_zaim_session_wrapper(request.destination_account_id, user_id, config.get("accounts", {}))
        
        # 1. Group items by their receipt/group identity for duplicate check and registration
        # We group by (date, group_id) to handle multiple receipts in one copy request
        receipt_groups = {} # key: (date, group_id or pseudo_id), value: list of items
        
        for item in request.items_to_copy:
            # If group_id is null, it's a single item, but we still group it to process consistently
            gid = item.group_id if item.group_id is not None else f"single_{int(time.time())}_{id(item)}"
            key = (item.date, gid)
            if key not in receipt_groups:
                receipt_groups[key] = []
            receipt_groups[key].append(item)
            
        # 2. Duplicate check (per receipt group)
        if not request.force:
            for (date, gid), items in receipt_groups.items():
                total = sum(i.amount for i in items)
                if check_zaim_duplicate(dest_session, date, total):
                     return {
                        "status": "warning",
                        "message": f"コピー先に重複の可能性がある支出が見つかりました（{date}・¥{total:,}）。続行しますか？",
                        "duplicate_found": True
                    }
        
        # 3. Execution (per receipt group)
        total_success_count = 0
        group_receipt_id_map = {}
        last_pseudo_id = int(time.time())
        
        for (date, gid), items in receipt_groups.items():
            # Generate or reuse pseudo receipt_id for this group
            if isinstance(gid, int): # Original Zaim group_id
                if gid not in group_receipt_id_map:
                    new_id = max(int(time.time()), last_pseudo_id + 1)
                    group_receipt_id_map[gid] = new_id
                    last_pseudo_id = new_id
                receipt_id = group_receipt_id_map[gid]
            else: # Pseudo gid for single items
                new_id = max(int(time.time()), last_pseudo_id + 1)
                receipt_id = new_id
                last_pseudo_id = new_id
            
            # Map Pydantic models to dictionaries for the service
            items_list = []
            for item in items:
                items_list.append({
                    "category_id": item.category_id,
                    "genre_id": item.genre_id,
                    "amount": item.amount,
                    "name": item.name,
                    "place": item.place,
                    "comment": item.comment,
                    "from_account_id": item.from_account_id
                })
            
            # [IMPORTANT] The frontend now sends items in the natural order (top-to-bottom).
            # We process them as-is to ensure Zaim registers them in that same order.
            
            # Register this entire receipt group via service
            success_count = zaim_service.register_receipt_items(
                session=dest_session,
                items=items_list,
                date=date,
                from_account_id=request.from_account_id,
                receipt_id=receipt_id
            )
            total_success_count += success_count
            
        return {
            "status": "success",
            "success_count": total_success_count,
            "failed_count": 0, # In this simplified version, we assume service handles logging/raising
            "errors": []
        }
    except Exception as e:
        print(f"Error in copy_history: {e}")
        traceback.print_exc()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/zaim/credentials/{account_id}")
async def get_zaim_credentials(account_id: str, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found.")
    acc = accounts[account_id]
    return {
        "id": acc["id"],
        "name": acc.get("name", ""),
        "consumer_key": acc.get("consumer_key", ""),
        "consumer_secret": acc.get("consumer_secret", ""),
        "token": acc.get("token", ""),
        "token_secret": acc.get("token_secret", "")
    }

@router.post("/api/zaim/credentials")
async def save_zaim_credentials(req: ZaimCredentialsRequest, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    target_id = req.account_id
    if not target_id or target_id.strip() == "":
        existing_ids = [int(i) for i in accounts.keys() if i.isdigit()]
        new_id = str(max(existing_ids) + 1) if existing_ids else "1"
        target_id = new_id

    accounts[target_id] = {
        "id": target_id,
        "name": req.name,
        "consumer_key": req.consumer_key,
        "consumer_secret": req.consumer_secret,
        "token": req.token,
        "token_secret": req.token_secret
    }
    config["accounts"] = accounts
    save_user_config(user_id, config)
    clear_zaim_master_data_db(user_id, target_id)
    return {
        "status": "success", 
        "message": "Zaim credentials saved.",
        "accounts": [{"id": acc["id"], "name": acc["name"]} for acc in accounts.values()]
    }

@router.patch("/api/zaim/credentials/{account_id}/name")
async def update_zaim_account_name(account_id: str, name_req: ZaimAccountUpdateRequest, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    if account_id in accounts:
        accounts[account_id]["name"] = name_req.name
        config["accounts"] = accounts
        save_user_config(user_id, config)
        return {"status": "success", "message": "Account name updated."}
    else:
        raise HTTPException(status_code=404, detail="Account not found.")

@router.delete("/api/zaim/credentials/{account_id}")
async def delete_zaim_credentials(account_id: str, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    if account_id in accounts:
        del accounts[account_id]
        config["accounts"] = accounts
        save_user_config(user_id, config)
        clear_zaim_master_data_db(user_id, account_id)
        return {"status": "success", "message": f"Account {account_id} deleted."}
    else:
        raise HTTPException(status_code=404, detail="Account not found.")
