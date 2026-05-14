import os
from typing import List, Dict, Any, Optional
from fastapi import HTTPException
from requests_oauthlib import OAuth1Session

# --- Zaim OAuth Constants ---
ZAIM_CONSUMER_KEY = os.environ.get("ZAIM_CONSUMER_KEY")
ZAIM_CONSUMER_SECRET = os.environ.get("ZAIM_CONSUMER_SECRET")
ZAIM_CALLBACK_URL = os.environ.get("ZAIM_CALLBACK_URL")

def get_zaim_session(account_id: str, user_id: str, accounts_config: Dict[str, Any]) -> OAuth1Session:
    """
    Creates an OAuth1Session for Zaim API based on user configuration.
    """
    str_account_id = str(account_id)
    acct = accounts_config.get(str_account_id)
    
    if not acct:
        print(f"DEBUG: get_zaim_session failed. user_id: {user_id}, requested account_id: {str_account_id}. Available accounts: {list(accounts_config.keys())}")
        raise HTTPException(status_code=400, detail=f"Account configuration for ID '{account_id}' not found.")
        
    if not ZAIM_CONSUMER_KEY or not ZAIM_CONSUMER_SECRET:
        raise HTTPException(status_code=500, detail="System Zaim Consumer credentials are not configured.")

    return OAuth1Session(
        ZAIM_CONSUMER_KEY,
        client_secret=ZAIM_CONSUMER_SECRET,
        resource_owner_key=acct["token"],
        resource_owner_secret=acct["token_secret"]
    )

def get_zaim_master_data(account_id: str, user_id: str, accounts_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fetches categories and genres from Zaim.
    """
    session = get_zaim_session(account_id, user_id, accounts_config)
    cat_res = session.get("https://api.zaim.net/v2/home/category")
    gen_res = session.get("https://api.zaim.net/v2/home/genre")
    
    if cat_res.status_code != 200:
        raise HTTPException(status_code=cat_res.status_code, detail=f"Failed to fetch categories from Zaim: {cat_res.text}")
    
    if gen_res.status_code != 200:
        raise HTTPException(status_code=gen_res.status_code, detail=f"Failed to fetch genres from Zaim: {gen_res.text}")

    cat_data = cat_res.json().get("categories", [])
    categories = [c for c in cat_data if c.get("mode") == "payment" and c.get("active") != -1]
    
    gen_data = gen_res.json().get("genres", [])
    genres = [g for g in gen_data if g.get("active") != -1]
        
    return {
        "categories": categories,
        "genres": genres
    }

def get_zaim_authorization_params(callback_url: str) -> Dict[str, str]:
    """
    Fetches a request token from Zaim and returns the authorization URL and related secrets.
    """
    if not ZAIM_CONSUMER_KEY or not ZAIM_CONSUMER_SECRET:
        raise HTTPException(status_code=500, detail="Zaim Consumer Key/Secret is missing in environment variables.")

    zaim = OAuth1Session(ZAIM_CONSUMER_KEY, client_secret=ZAIM_CONSUMER_SECRET, callback_uri=callback_url)
    request_token_url = "https://api.zaim.net/v2/auth/request"
    
    try:
        fetch_response = zaim.fetch_request_token(request_token_url)
        oauth_token = fetch_response.get('oauth_token')
        oauth_token_secret = fetch_response.get('oauth_token_secret')
        
        base_authorization_url = "https://auth.zaim.net/users/auth"
        authorization_url = zaim.authorization_url(base_authorization_url, oauth_token=oauth_token, oauth_callback=callback_url)
        
        return {
            "auth_url": authorization_url,
            "oauth_token": oauth_token,
            "oauth_token_secret": oauth_token_secret
        }
    except Exception as e:
        raise Exception(f"Failed to initiate Zaim OAuth: {str(e)}")

def exchange_zaim_access_token(oauth_token: str, request_token_secret: str, oauth_verifier: str) -> Dict[str, str]:
    """
    Exchanges an OAuth verifier for an access token.
    """
    if not ZAIM_CONSUMER_KEY or not ZAIM_CONSUMER_SECRET:
         raise HTTPException(status_code=500, detail="Zaim Consumer Key/Secret is missing in environment variables.")

    try:
        zaim = OAuth1Session(
            ZAIM_CONSUMER_KEY, 
            client_secret=ZAIM_CONSUMER_SECRET,
            resource_owner_key=oauth_token,
            resource_owner_secret=request_token_secret
        )
        access_token_url = "https://api.zaim.net/v2/auth/access"
        token_res = zaim.fetch_access_token(access_token_url, verifier=oauth_verifier)
        
        return {
            "oauth_token": token_res.get('oauth_token'),
            "oauth_token_secret": token_res.get('oauth_token_secret')
        }
    except Exception as e:
        raise Exception(f"OAuth failed: {str(e)}")

def fetch_zaim_accounts_raw(session: OAuth1Session) -> List[Dict[str, Any]]:
    """
    Fetches account list from Zaim API.
    """
    url = "https://api.zaim.net/v2/home/account"
    res = session.get(url)
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail=f"Failed to fetch accounts from Zaim: {res.text}")
    return res.json().get("accounts", [])

def check_zaim_duplicate(session: OAuth1Session, date: str, total_amount: int) -> bool:
    """
    Checks if a duplicate spending exists for a given date and amount.
    """
    url = "https://api.zaim.net/v2/home/money"
    params = {
        "mapping": 1,
        "start_date": date,
        "end_date": date
    }
    res = session.get(url, params=params)
    if res.status_code == 200:
        history = res.json().get("money", [])
        groups = {}
        for h_item in history:
            if h_item.get("mode") != "payment":
                continue
            rid = h_item.get("receipt_id")
            if rid is None or rid == 0:
                groups[f"manual_{h_item.get('id')}"] = int(h_item.get("amount", 0))
            else:
                if rid not in groups:
                    groups[rid] = 0
                groups[rid] += int(h_item.get("amount", 0))
        
        for amt in groups.values():
            if amt == total_amount:
                return True
    return False

def register_payment_item(session: OAuth1Session, payload: Dict[str, Any]) -> bool:
    """
    Registers a single payment entry to Zaim.
    """
    url = "https://api.zaim.net/v2/home/money/payment"
    res = session.post(url, data=payload)
    if res.status_code != 200:
        print(f"Payment registration failed: {res.text}")
        return False
    return True

def fetch_money_history(session: OAuth1Session, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Fetches money history from Zaim API.
    """
    url = "https://api.zaim.net/v2/home/money"
    res = session.get(url, params=params)
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail=f"Failed to fetch history from Zaim: {res.text}")
    return res.json().get("money", [])

def fetch_history_with_categories(session: OAuth1Session, master_data: Dict[str, Any], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Fetches history and maps category IDs to names using the provided master data.
    """
    history = fetch_money_history(session, params)
    
    if not master_data or "categories" not in master_data:
        return history
        
    cat_map = {c["id"]: c["name"] for c in master_data.get("categories", [])}
    for item in history:
        item["category_name"] = cat_map.get(item.get("category_id"))
        
    return history

def get_zaim_session_wrapper(account_id: str, user_id: str, accounts_config: Dict[str, Any]):
    return get_zaim_session(account_id, user_id, accounts_config)

def get_account_from_id(account_id: str, user_id: str, accounts_config: Dict[str, Any]):
    str_account_id = str(account_id)
    acct = accounts_config.get(str_account_id)
    
    if not acct:
        print(f"DEBUG: get_account_from_id failed. user_id: {user_id}, requested account_id: {str_account_id}. Available accounts: {list(accounts_config.keys())}")
        raise HTTPException(status_code=400, detail=f"Account configuration for ID '{account_id}' not found.")
        
    return acct

def get_zaim_master_data_wrapper(account_id: str, user_id: str, accounts_config: Dict[str, Any]):
    return get_zaim_master_data(account_id, user_id, accounts_config)
