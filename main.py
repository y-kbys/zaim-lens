import os
import time
import base64
import uuid
import random
import asyncio
from typing import List, Optional, Callable
from fastapi import FastAPI, HTTPException, Body, Depends, Request
import datetime
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from schemas import (
    ParseRequest, RegisterRequest, CopyItem, CopyRequest,
    ZaimAccount, GeminiCredentialsRequest, ZaimCredentialsRequest,
    ReceiptParserResult
)
import json
import traceback
from dotenv import load_dotenv
from services.gemini import ReceiptParserResult, analyze_receipt
from services.zaim_client import (
    ZAIM_CALLBACK_URL, get_zaim_session, get_zaim_master_data, 
    get_master_data_from_cache, clear_master_data_cache,
    get_zaim_authorization_params, exchange_zaim_access_token,
    fetch_zaim_accounts_raw, check_zaim_duplicate, 
    register_payment_item, fetch_money_history, fetch_history_with_categories
)
from services.auth import verify_token, verify_token_optional, verify_token_manually
from db import get_user_config, save_user_config, delete_user_config, firebase_app

load_dotenv()

SESSION_SECRET = os.environ.get("SESSION_SECRET", os.environ.get("ENCRYPTION_KEY", "temporary-secret-for-session"))

# --- Pydantic Schemas from schemas.py ---

def migrate_env_to_firestore():
    # Only run once at startup to populate default_user if empty
    config = get_user_config("default_user")
    if config.get("accounts"):
        return

    accounts = {}
    # Parse dynamic accounts from .env
    for key, value in os.environ.items():
        if key.startswith("ZAIM_ACCOUNT_") and key.endswith("_NAME"):
            parts = key.split("_")
            if len(parts) >= 4:
                acct_id = parts[2]
                name = value
                consumer_key = os.environ.get(f"ZAIM_ACCOUNT_{acct_id}_CONSUMER_KEY")
                consumer_secret = os.environ.get(f"ZAIM_ACCOUNT_{acct_id}_CONSUMER_SECRET")
                token = os.environ.get(f"ZAIM_ACCOUNT_{acct_id}_TOKEN")
                token_secret = os.environ.get(f"ZAIM_ACCOUNT_{acct_id}_TOKEN_SECRET")
                
                if all([consumer_key, consumer_secret, token, token_secret]):
                    accounts[acct_id] = {
                        "id": acct_id,
                        "name": name,
                        "token": token,
                        "token_secret": token_secret
                    }

    # Fallback/Backward compatibility
    if not accounts:
        legacy_key = os.environ.get("ZAIM_CONSUMER_KEY")
        legacy_secret = os.environ.get("ZAIM_CONSUMER_SECRET")
        legacy_token = os.environ.get("ZAIM_TOKEN")
        legacy_token_secret = os.environ.get("ZAIM_TOKEN_SECRET")
        
        if all([legacy_key, legacy_secret, legacy_token, legacy_token_secret]):
            accounts["1"] = {
                "id": "1",
                "name": "Default Account",
                "token": legacy_token,
                "token_secret": legacy_token_secret
            }
            
    if accounts:
        print("Migrating legacy environment variables to Firestore for default_user")
        save_user_config("default_user", {"accounts": accounts})

# Run migration on startup
try:
    migrate_env_to_firestore()
except Exception as e:
    import traceback
    print("WARNING: migrate_env_to_firestore failed during startup:")
    traceback.print_exc()


def get_zaim_session_wrapper(account_id: str, user_id: str):
    config = get_user_config(user_id)
    return get_zaim_session(account_id, user_id, config.get("accounts", {}))

def get_account_from_id(account_id: str, user_id: str):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    str_account_id = str(account_id)
    acct = accounts.get(str_account_id)
    
    if not acct:
        print(f"DEBUG: get_account_from_id failed. user_id: {user_id}, requested account_id: {str_account_id}. Available accounts: {list(accounts.keys())}")
        raise HTTPException(status_code=400, detail=f"Account configuration for ID '{account_id}' not found.")
        
    return acct

def get_zaim_master_data_wrapper(account_id: str, user_id: str):
    config = get_user_config(user_id)
    return get_zaim_master_data(account_id, user_id, config.get("accounts", {}))

# --- App Initialization ---
app = FastAPI(title="Zaim Lens")
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Add SessionMiddleware for OAuth 1.0a request token secret storage
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

# Load legacy API key if any
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")



@app.get("/", response_class=HTMLResponse)
async def read_index():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return "index.html not found in static/"

# Temporary in-memory cache for OAuth secrets to handle cross-domain cookie blocking in SPAs
OAUTH_SECRETS = {}

@app.get("/api/zaim/login")
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

@app.get("/api/zaim/callback")
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
        # If we lost user_id, we can't save the token. 
        # We might need to ask the user to log in again or use a temporary cookie.
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
        # Generate or reuse account ID securely
        # First check for existing name to allow overwriting if user uses the exact same name
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

@app.get("/api/zaim/status")
async def get_zaim_status(user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    # Return basic info without sensitive tokens (though DB layer handles encryption, we shouldn't leak even decrypted ones)
    status_list = []
    for aid, ainfo in accounts.items():
        status_list.append({
            "id": aid,
            "name": ainfo.get("name", "Unknown"),
            "connected": True
        })
    return {"accounts": status_list}

@app.delete("/api/zaim/disconnect/{account_id}")
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


@app.get("/api/config")
async def get_firebase_config():
    """Provides Firebase config from environment variables to the frontend."""
    return {
        "firebaseConfig": {
            "apiKey": os.environ.get("FIREBASE_API_KEY"),
            "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN"),
            "projectId": os.environ.get("FIREBASE_PROJECT_ID"),
            "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET"),
            "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID"),
            "appId": os.environ.get("FIREBASE_APP_ID"),
            "measurementId": os.environ.get("FIREBASE_MEASUREMENT_ID")
        }
    }

@app.post("/api/parse")
async def parse_screenshot(request: ParseRequest = Body(...), user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    user_gemini_key = config.get("gemini_api_key")
    if not user_gemini_key:
        if GEMINI_API_KEY:
            user_gemini_key = GEMINI_API_KEY
        else:
             raise HTTPException(status_code=400, detail="Gemini API Key is not configured. 歯車アイコンからAPIキーを設定してください。")

    # Find the target account
    accounts = config.get("accounts", {})
    if not accounts:
        raise HTTPException(status_code=400, detail="Zaim連携が設定されていません。右上のアイコンからZaim連携を行ってください。")

    target_account_id = request.account_id
    if not target_account_id or target_account_id not in accounts:
        # Default to the first account if not specified or invalid
        target_account_id = list(accounts.keys())[0]

    try:
        master_data_context = get_zaim_master_data_wrapper(target_account_id, user_id)
        result_dict = await analyze_receipt(request.image_base64, user_gemini_key, master_data_context)
        
        master_data = get_master_data_from_cache(user_id, target_account_id)
        if master_data:
            result_dict["master_categories"] = master_data["categories"]
            result_dict["master_genres"] = master_data["genres"]
        else:
            result_dict["master_categories"] = []
            result_dict["master_genres"] = []
        
        return result_dict
    except Exception as e:
        # Avoid double-wrapping HTTPExceptions
        if isinstance(e, HTTPException):
            raise e
        print(f"Unexpected error in parse_screenshot: {e}")
        raise HTTPException(status_code=500, detail=f"予期せぬエラーが発生しました。詳細: {str(e)}")



@app.get("/api/zaim/accounts")
async def get_zaim_accounts(account_id: str = "1", user_id: str = Depends(verify_token)):
    session = get_zaim_session_wrapper(account_id, user_id)
    accounts = fetch_zaim_accounts_raw(session)
    # 支払い元として利用可能なもの（active != -1）を返す
    return [ZaimAccount(id=a["id"], name=a["name"]) for a in accounts if a.get("active") != -1]

@app.get("/api/zaim/categories")
async def get_categories(account_id: str = "1", user_id: str = Depends(verify_token)):
    """
    Returns master categories and genres for a specific account.
    """
    try:
        # get_zaim_master_data populates master data for the given account_id
        get_zaim_master_data_wrapper(account_id, user_id)
        
        master_data = get_master_data_from_cache(user_id, account_id)
        if not master_data:
            raise HTTPException(status_code=500, detail="Failed to load master data cache.")
            
        return {
            "master_categories": master_data["categories"],
            "master_genres": master_data["genres"]
        }
    except Exception as e:
        print(f"Error fetching categories for {account_id} / {user_id}: {e}")
        import traceback
        traceback.print_exc()
        # Do not raise a generic 500 without logging if it's an authorization issue
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/register")
async def register_to_zaim(request: RegisterRequest = Body(...), user_id: str = Depends(verify_token)):
    print(f"Starting Registration to Zaim. Items: {len(request.receipt_data.items)}")
    session = get_zaim_session_wrapper(request.target_account_id, user_id)
    receipt_data = request.receipt_data

    # --- Duplicate Check Logic ---
    if not request.force:
        # Calculate total amount of the current receipt
        total_amount = sum(item.price for item in receipt_data.items) - (receipt_data.point_usage or 0)
        
        if check_zaim_duplicate(session, receipt_data.date, total_amount):
            return {
                "status": "warning",
                "message": "重複の可能性がある支出が見つかりました（同一日付・同一金額）。",
                "duplicate_found": True
            }
    # --- End Duplicate Check Logic ---
    
    # Use provided receipt_id or generate a new one
    if request.receipt_id:
        pseudo_receipt_id = request.receipt_id
    else:
        # Generate pseudo receipt_id using current time (seconds) to fit in 32-bit unsigned range
        # Current timestamp (~1.7B) fits safely under 4.2B (32-bit uint) and 2.1B (32-bit int)
        pseudo_receipt_id = int(time.time())
    
    print(f"Using/Generated 32-bit safe pseudo receipt_id: {pseudo_receipt_id}")
    
    # Get from_account_id from request
    from_account_id = request.from_account_id
    
    # 1. Register Payment Items (Image upload is not supported by public API)
    payment_url = "https://api.zaim.net/v2/home/money/payment"
    receipt_data = request.receipt_data
    
    registered_items = []
    
    for item in receipt_data.items:
        payload = {
            "mapping": 1,
            "category_id": item.category_id,
            "genre_id": item.genre_id,
            "amount": item.price,
            "date": receipt_data.date,
            "name": item.name,
            "receipt_id": pseudo_receipt_id,
        }
        if from_account_id is not None and from_account_id != "":
            payload["from_account_id"] = from_account_id
            
        if receipt_data.store:
            payload["place"] = receipt_data.store
        if register_payment_item(session, payload):
            registered_items.append(item.name)
            
    # 3. Handle Point Usage (Negative expense)
    if receipt_data.point_usage > 0:
        point_payload = {
            "mapping": 1,
            "category_id": receipt_data.items[0].category_id if len(receipt_data.items) > 0 else 101,
            "genre_id": receipt_data.items[0].genre_id if len(receipt_data.items) > 0 else 10101,
            "amount": -receipt_data.point_usage,  # Negative value
            "date": receipt_data.date,
            "name": "ポイント利用",
            "receipt_id": pseudo_receipt_id,
        }
        if from_account_id is not None and from_account_id != "":
            point_payload["from_account_id"] = from_account_id
            
        if receipt_data.store:
            point_payload["place"] = receipt_data.store
        if register_payment_item(session, point_payload):
             registered_items.append("ポイント利用 (割引)")
    
    return {
        "status": "success",
        "registered_count": len(registered_items),
        "receipt_id": pseudo_receipt_id,
        "message": f"Successfully registered {len(registered_items)} items."
    }


@app.get("/api/accounts")
async def get_accounts(user_id: str = Depends(verify_token)):
    # Return list of accounts without secrets
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    
    accounts_list = []
    for acct_id, acct_data in accounts.items():
        accounts_list.append({
            "id": acct_id,
            "name": acct_data.get("name", "Unnamed Account")
        })
    return accounts_list

@app.get("/api/history")
async def get_history(account_id: str, period: Optional[int] = 30, start_date: Optional[str] = None, end_date: Optional[str] = None, user_id: str = Depends(verify_token)):
    try:
        session = get_zaim_session_wrapper(account_id, user_id)
        
        now = datetime.datetime.now()
        
        if start_date and end_date:
            start_date_str = start_date
            end_date_str = end_date
        else:
            # Restrict to past and present entries to avoid future repeating payments
            end_date_str = now.strftime("%Y-%m-%d")
            # Calculate start date based on period (days)
            computed_start_date = now - datetime.timedelta(days=period)
            start_date_str = computed_start_date.strftime("%Y-%m-%d")
        
        params = {
            "mapping": 1,
            "start_date": start_date_str,
            "end_date": end_date_str
        }
        
        # Ensure master data is loaded and use specialized helper
        get_zaim_master_data_wrapper(account_id, user_id)
        history = fetch_history_with_categories(session, user_id, account_id, params)
        
        return {"history": history}
    except Exception as e:
        print(f"Error in get_history: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/copy")
async def copy_history(request: CopyRequest = Body(...), user_id: str = Depends(verify_token)):
    print(f"Starting History Copy from Account {request.source_account_id} to Account {request.destination_account_id}. Items: {len(request.items_to_copy)}")
    
    # Use destination account for writing
    dest_session = get_zaim_session_wrapper(request.destination_account_id, user_id)
    
    payment_url = "https://api.zaim.net/v2/home/money/payment"
    
    # --- Duplicate Check Logic ---
    if not request.force:
        # Group incoming items to check totals
        incoming_groups = {}
        for item in request.items_to_copy:
            gid = item.group_id if item.group_id is not None else f"single_{int(time.time())}_{id(item)}"
            if gid not in incoming_groups:
                incoming_groups[gid] = {"date": item.date, "total": 0}
            incoming_groups[gid]["total"] += item.amount
        
        unique_dates = list(set(g["date"] for g in incoming_groups.values()))
        
        # Check destination account for each date
        for d in unique_dates:
            if check_zaim_duplicate(dest_session, d, incoming_groups[d]["total"]):
                 return {
                    "status": "warning",
                    "message": f"コピー先に重複の可能性がある支出が見つかりました（{d}・¥{incoming_groups[d]['total']:,}）。続行しますか？",
                    "duplicate_found": True
                }
    # --- End Duplicate Check Logic ---
    
    # Track generated receipt IDs for groups to maintain original grouping
    group_receipt_id_map = {}
    last_pseudo_id = int(time.time())

    success_count = 0
    errors = []
    
    for item in request.items_to_copy:
        # Determine receipt_id for grouping
        if item.group_id is not None:
             if item.group_id not in group_receipt_id_map:
                  # Use strictly increasing seconds-based ID to fit 32-bit range
                  new_id = max(int(time.time()), last_pseudo_id + 1)
                  group_receipt_id_map[item.group_id] = new_id
                  last_pseudo_id = new_id
             receipt_id = group_receipt_id_map[item.group_id]
        else:
             # Individual entry: strictly increasing
             new_id = max(int(time.time()), last_pseudo_id + 1)
             receipt_id = new_id
             last_pseudo_id = new_id
             
        payload = {
            "mapping": 1,
            "category_id": item.category_id,
            "genre_id": item.genre_id,
            "amount": item.amount,
            "date": item.date,
            "name": item.name,
            "receipt_id": receipt_id
        }
        
        # prefer item-level from_account_id if provided, otherwise use global one
        effective_from_account_id = item.from_account_id if item.from_account_id is not None else request.from_account_id
        
        if effective_from_account_id is not None and effective_from_account_id != "":
             payload["from_account_id"] = effective_from_account_id
             
        if item.place:
            payload["place"] = item.place
        if item.comment:
            payload["comment"] = item.comment
            
        if register_payment_item(dest_session, payload):
            success_count += 1
            
    return {
        "status": "success" if len(errors) == 0 else "partial_success",
        "success_count": success_count,
        "failed_count": len(errors),
        "errors": errors
    }



@app.get("/api/gemini/credentials")
async def get_gemini_credentials(user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    key = config.get("gemini_api_key")
    return {
        "is_configured": bool(key),
        "api_key_last_4": key[-4:] if key and len(key) > 4 else ("*" * len(key) if key else "")
    }

@app.post("/api/gemini/credentials")
async def save_gemini_credentials(req: GeminiCredentialsRequest, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    config["gemini_api_key"] = req.gemini_api_key
    save_user_config(user_id, config)
    return {"status": "success", "message": "Gemini API key saved successfully."}

@app.delete("/api/gemini/credentials")
async def delete_gemini_credentials(user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    if "gemini_api_key" in config:
        del config["gemini_api_key"]
        save_user_config(user_id, config)
    return {"status": "success", "message": "Gemini API key deleted."}



@app.post("/api/zaim/credentials")
async def save_zaim_credentials(req: ZaimCredentialsRequest, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    
    # Use existing ID or generate a new one
    target_id = req.account_id
    if not target_id or target_id.strip() == "":
        # Generate a new numeric ID as string
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

    # Invalidate cache for this specific account
    clear_master_data_cache(user_id, target_id)
    
    # Return updated list of simplified account info for UI
    return {
        "status": "success", 
        "message": "Zaim credentials saved.",
        "accounts": [{"id": acc["id"], "name": acc["name"]} for acc in accounts.values()]
    }

@app.get("/api/zaim/credentials/{account_id}")
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

@app.delete("/api/zaim/credentials/{account_id}")
async def delete_zaim_credentials(account_id: str, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    
    if account_id in accounts:
        del accounts[account_id]
        config["accounts"] = accounts
        save_user_config(user_id, config)
        
        # Invalidate cache
        clear_master_data_cache(user_id, account_id)
            
        return {"status": "success", "message": f"Account {account_id} deleted."}
    else:
        raise HTTPException(status_code=404, detail="Account not found.")

@app.delete("/api/user")
async def delete_user_account(user_id: str = Depends(verify_token)):
    """
    Delete all user data from Firestore permanently.
    The frontend is responsible for deleting the user from Firebase Auth.
    """
    success = delete_user_config(user_id)
    if success:
        # Clear all cache entries for this user
        clear_master_data_cache(user_id)
            
        return {"status": "success", "message": "User data completely removed."}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete user data.")
