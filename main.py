import os
import time
import base64
import uuid
import random
import asyncio
from typing import List, Optional, Callable
from fastapi import FastAPI, HTTPException, Body, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
import datetime
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import json
import traceback
from google import genai
from google.genai import types, errors
from dotenv import load_dotenv
import jwt
import requests
from requests_oauthlib import OAuth1Session
from db import get_user_config, save_user_config, delete_user_config, firebase_app

load_dotenv()

# --- Pydantic Schemas ---
class ReceiptItem(BaseModel):
    name: str
    price: int
    category_id: int
    genre_id: int

class ReceiptParserResult(BaseModel):
    date: str
    store: str
    items: List[ReceiptItem]
    point_usage: int

class ParseRequest(BaseModel):
    image_base64: str

class RegisterRequest(BaseModel):
    receipt_data: ReceiptParserResult
    force: bool = False
    from_account_id: Optional[int] = None
    target_account_id: str = "1"
    receipt_id: Optional[int] = None

class CopyItem(BaseModel):
    mapping: int = 1
    category_id: int
    genre_id: int
    amount: int
    date: str
    name: str
    place: Optional[str] = None
    comment: Optional[str] = None
    group_id: Optional[int] = None
    from_account_id: Optional[int] = None

class CopyRequest(BaseModel):
    source_account_id: str
    destination_account_id: str
    from_account_id: Optional[int] = None
    items_to_copy: List[CopyItem]
    force: bool = False

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
                        "consumer_key": consumer_key,
                        "consumer_secret": consumer_secret,
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
                "consumer_key": legacy_key,
                "consumer_secret": legacy_secret,
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


def get_zaim_session(account_id: str, user_id: str):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    # Ensure account_id is treated as a string since JSON object keys are strings
    str_account_id = str(account_id)
    acct = accounts.get(str_account_id)
    
    if not acct:
        print(f"DEBUG: get_zaim_session failed. user_id: {user_id}, requested account_id: {str_account_id}. Available accounts: {list(accounts.keys())}")
        raise HTTPException(status_code=400, detail=f"Account configuration for ID '{account_id}' not found.")
        
    return OAuth1Session(
        acct["consumer_key"],
        client_secret=acct["consumer_secret"],
        resource_owner_key=acct["token"],
        resource_owner_secret=acct["token_secret"]
    )

def get_account_from_id(account_id: str, user_id: str):
    config = get_user_config(user_id)
    accounts = config.get("accounts", {})
    str_account_id = str(account_id)
    acct = accounts.get(str_account_id)
    
    if not acct:
        print(f"DEBUG: get_account_from_id failed. user_id: {user_id}, requested account_id: {str_account_id}. Available accounts: {list(accounts.keys())}")
        raise HTTPException(status_code=400, detail=f"Account configuration for ID '{account_id}' not found.")
        
    return acct

# Caching master data per account to support multi-account switching
MASTER_DATA_CACHE = {} # {account_id: {"categories": [], "genres": [], "prompt_context": ""}}

def get_zaim_master_data(account_id: str, user_id: str):
    global MASTER_DATA_CACHE
    cache_key = f"{user_id}_{account_id}"
    
    # Return from cache if available
    if cache_key in MASTER_DATA_CACHE:
        return MASTER_DATA_CACHE[cache_key]["prompt_context"]

    session = get_zaim_session(account_id, user_id)
    cat_res = session.get("https://api.zaim.net/v2/home/category")
    gen_res = session.get("https://api.zaim.net/v2/home/genre")
    
    categories = []
    genres = []
    
    if cat_res.status_code == 200:
        cat_data = cat_res.json().get("categories", [])
        categories = [c for c in cat_data if c.get("mode") == "payment" and c.get("active") != -1]
    
    if gen_res.status_code == 200:
        gen_data = gen_res.json().get("genres", [])
        genres = [g for g in gen_data if g.get("active") != -1]
        
    lines = ["\n【Zaim カテゴリ＆ジャンル一覧】"]
    for cat in categories:
        c_id = cat["id"]
        c_name = cat["name"]
        cat_genres = [g for g in genres if g.get("category_id") == c_id]
        if cat_genres:
            g_texts = [f"ID:{g['id']} ({g['name']})" for g in cat_genres]
            lines.append(f"- カテゴリID: {c_id} ({c_name}) 含まれるジャンル: " + ", ".join(g_texts))
            
    prompt_context = "\n".join(lines)
    
    # Store in cache
    MASTER_DATA_CACHE[cache_key] = {
        "categories": categories,
        "genres": genres,
        "prompt_context": prompt_context
    }
    
    return prompt_context

# --- App Initialization ---
app = FastAPI(title="Zaim Lens")
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Load legacy API key if any
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return "index.html not found in static/"

# Firebase Auth Dependency
# --- Manual JWT Verification Fallback ---
# Standard firebase-admin verification requires service account credentials even for public key checks.
# This manual fallback allows local testing without a service account JSON file.
FIREBASE_KEYS_CACHE = {"keys": {}, "expiry": 0}

def get_firebase_public_keys():
    global FIREBASE_KEYS_CACHE
    if time.time() < FIREBASE_KEYS_CACHE["expiry"]:
        return FIREBASE_KEYS_CACHE["keys"]
    try:
        res = requests.get("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com")
        if res.status_code == 200:
            FIREBASE_KEYS_CACHE["keys"] = res.json()
            cc = res.headers.get("Cache-Control", "")
            max_age = 3600
            if "max-age=" in cc:
                try:
                    max_age = int(cc.split("max-age=")[1].split(",")[0])
                except: pass
            FIREBASE_KEYS_CACHE["expiry"] = time.time() + max_age
            return FIREBASE_KEYS_CACHE["keys"]
    except Exception as e:
        print(f"Error fetching Firebase public keys: {e}")
    return {}

def verify_token_manually(id_token: str) -> str:
    project_id = os.environ.get("FIREBASE_PROJECT_ID")
    if not project_id:
        raise Exception("FIREBASE_PROJECT_ID environment variable is missing.")
    
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    public_keys = get_firebase_public_keys()
    cert_str = public_keys.get(kid)
    
    if not cert_str:
        raise Exception(f"Public key for kid '{kid}' not found.")
        
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend
    cert_obj = x509.load_pem_x509_certificate(cert_str.encode(), default_backend())
    public_key = cert_obj.public_key()
    
    decoded = jwt.decode(
        id_token,
        public_key,
        algorithms=["RS256"],
        audience=project_id,
        issuer=f"https://securetoken.google.com/{project_id}"
    )
    # Firebase ID tokens use 'sub' for the user UID. 'uid' is sometimes present depending on the library.
    uid = decoded.get("uid") or decoded.get("sub")
    if not uid:
        print(f"Manual decode success but missing identifier. Claims: {list(decoded.keys())}")
        raise Exception("Token does not contain a uid or sub claim.")
    return uid

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Verifies Firebase JWT token and returns the user's UID."""
    id_token = credentials.credentials
    try:
        # 1. Try standard Firebase Admin SDK verification (Requires ADC/Service Account)
        decoded_token = auth.verify_id_token(id_token, app=firebase_app)
        return decoded_token['uid']
    except Exception as e:
        error_msg = str(e)
        if "Your default credentials were not found" in error_msg:
            # 2. Fallback: Manual verification using public keys (Works locally without credentials)
            try:
                print("Firebase Admin verification failed (no credentials). Attempting manual verification fallback...")
                return verify_token_manually(id_token)
            except Exception as me:
                print(f"Manual verification also failed: {me}")
                raise HTTPException(
                    status_code=401,
                    detail=f"Authentication failed: {error_msg} AND {str(me)}",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        
        print(f"Token verification failed: {error_msg}")
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired authentication token: {error_msg}",
            headers={"WWW-Authenticate": "Bearer"},
        )

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
    try:
        base64_data = request.image_base64
        if ";" in base64_data and "base64," in base64_data:
            base64_data = base64_data.split("base64,")[1]
            
        decoded_image_data = base64.b64decode(base64_data)
        
        prompt = f"""これは紙のレシートまたはオンラインストアやアプリの購入履歴画面のスクリーンショットである。
UIのノイズを無視し、純粋な購入品名と金額、そしてもしあればポイント利用額（`point_usage`）を抽出せよ。ポイント利用がなければ `point_usage` は 0 とすること。
購入日（`date`）はYYYY-MM-DD形式にすること。店舗名（`store`）も推測可能な限り抽出すること。
さらに、以下のZaimのカテゴリ＆ジャンル一覧から、各品目に最も適した `category_id` と `genre_id` を推論して `items` 内に含めること。
出力は指定されたJSONスキーマに厳格に従うこと。

{get_zaim_master_data("1", user_id)}"""

        image_part = types.Part.from_bytes(data=decoded_image_data, mime_type="image/jpeg",)

        async def run_gemini(model_name: str) -> ReceiptParserResult:
            # Create a separate client instance to avoid global state and concurrency blocking issues
            client = genai.Client(api_key=user_gemini_key)
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=[
                    prompt, 
                    image_part
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ReceiptParserResult,
                )
            )
            return ReceiptParserResult.model_validate_json(response.text)

        try:
            # gemini-1.5-flash is robust and widely available. 
            # 2.0 or 2.5 names might be unstable or require specific regions/tiers.
            gemini_result = await run_gemini("gemini-1.5-flash")
        except Exception as e:
            print(f"Fallback initiated due to error with gemini-1.5-flash: {e}")
            # Fallback to the lite model
            gemini_result = await run_gemini("gemini-1.5-flash-8b")
        
        result_dict = gemini_result.model_dump()
        cache_key = f"{user_id}_1" # Defaulting to account 1's master data for UI prompt if needed, though usually it matches current account
        if cache_key in MASTER_DATA_CACHE:
            result_dict["master_categories"] = MASTER_DATA_CACHE[cache_key]["categories"]
            result_dict["master_genres"] = MASTER_DATA_CACHE[cache_key]["genres"]
        else:
            result_dict["master_categories"] = []
            result_dict["master_genres"] = []
        
        return result_dict
    except errors.APIError as e:
        print(f"Gemini APIError: {e}")
        if e.code == 429:
            raise HTTPException(status_code=429, detail="Geminiの実行回数制限（レートリミット）に達しました。しばらく時間を置いてから再度お試しください。")
        raise HTTPException(status_code=500, detail=f"レシートの解析に失敗しました。詳細: {e.message}")
    except Exception as e:
        print(f"Error calling Gemini: {e}")
        # Return detail as a string to handle non-JSON responses gracefully
        raise HTTPException(status_code=500, detail=f"レシートの解析に失敗しました。Geminiからの応答が正しくないか、サーバーエラーが発生しました。詳細: {str(e)}")

class ZaimAccount(BaseModel):
    id: int
    name: str

@app.get("/api/zaim/accounts")
async def get_zaim_accounts(account_id: str = "1", user_id: str = Depends(verify_token)):
    session = get_zaim_session(account_id, user_id)
    url = "https://api.zaim.net/v2/home/account"
    res = session.get(url)
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail=f"Failed to fetch accounts from Zaim: {res.text}")
    
    accounts = res.json().get("accounts", [])
    # 支払い元として利用可能なもの（active != -1）を返す
    return [ZaimAccount(id=a["id"], name=a["name"]) for a in accounts if a.get("active") != -1]

@app.get("/api/zaim/categories")
async def get_categories(account_id: str = "1", user_id: str = Depends(verify_token)):
    """
    Returns master categories and genres for a specific account.
    """
    try:
        # get_zaim_master_data populates MASTER_DATA_CACHE for the given account_id
        get_zaim_master_data(account_id, user_id)
        
        cache_key = f"{user_id}_{account_id}"
        if cache_key not in MASTER_DATA_CACHE:
            raise HTTPException(status_code=500, detail="Failed to load master data cache.")
            
        return {
            "master_categories": MASTER_DATA_CACHE[cache_key]["categories"],
            "master_genres": MASTER_DATA_CACHE[cache_key]["genres"]
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
    session = get_zaim_session(request.target_account_id, user_id)
    receipt_data = request.receipt_data

    # --- Duplicate Check Logic ---
    if not request.force:
        # Calculate total amount of the current receipt
        total_amount = sum(item.price for item in receipt_data.items) - (receipt_data.point_usage or 0)
        
        # Check Zaim history for the same date
        url = "https://api.zaim.net/v2/home/money"
        params = {
            "mapping": 1,
            "start_date": receipt_data.date,
            "end_date": receipt_data.date
        }
        res = session.get(url, params=params)
        if res.status_code == 200:
            history = res.json().get("money", [])
            # Group by receipt_id
            groups = {}
            for h_item in history:
                if h_item.get("mode") != "payment":
                    continue
                rid = h_item.get("receipt_id")
                if rid is None or rid == 0:
                    # Treat each manual entry as its own "group" using a unique key
                    groups[f"manual_{h_item.get('id')}"] = int(h_item.get("amount", 0))
                else:
                    if rid not in groups:
                        groups[rid] = 0
                    groups[rid] += int(h_item.get("amount", 0))
            
            # Compare totals
            for rid, amt in groups.items():
                if amt == total_amount:
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
        res = session.post(payment_url, data=payload)
        if res.status_code != 200:
            print(f"Payment registration failed for {item.name}: {res.text}")
            # Consider atomic rollback here normally, but ignoring for basic flow
        else:
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
        pt_res = session.post(payment_url, data=point_payload)
        if pt_res.status_code != 200:
             print(f"Point usage registration failed: {pt_res.text}")
        else:
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
        session = get_zaim_session(account_id, user_id)
        url = f"https://api.zaim.net/v2/home/money"
        
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
        
        # Ensure master data is loaded
        get_zaim_master_data(account_id, user_id)
        
        res = session.get(url, params=params)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=f"Failed to fetch history: {res.text}")
        
        data = res.json()
        history = data.get("money", [])

        cache_key = f"{user_id}_{account_id}"
        if cache_key not in MASTER_DATA_CACHE:
             print(f"Warning: Account {account_id} not found in MASTER_DATA_CACHE for user {user_id}. Forced blank map.")
             cat_map = {}
        else:
             cat_map = {c["id"]: c["name"] for c in MASTER_DATA_CACHE[cache_key].get("categories", [])}
             
        for item in history:
            item["category_name"] = cat_map.get(item.get("category_id"))
            
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
    dest_session = get_zaim_session(request.destination_account_id, user_id)
    
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
            params = {
                "mapping": 1,
                "start_date": d,
                "end_date": d
            }
            history_res = dest_session.get("https://api.zaim.net/v2/home/money", params=params)
            if history_res.status_code == 200:
                history_data = history_res.json().get("money", [])
                
                # Group existing by receipt_id
                existing_groups = {}
                for h_item in history_data:
                    if h_item.get("mode") != "payment":
                        continue
                    rid = h_item.get("receipt_id")
                    if rid is None or rid == 0:
                        existing_groups[f"manual_{h_item.get('id')}"] = int(h_item.get("amount", 0))
                    else:
                        if rid not in existing_groups:
                            existing_groups[rid] = 0
                        existing_groups[rid] += int(h_item.get("amount", 0))
                
                # Check for matches
                for ig_id, ig_info in incoming_groups.items():
                    if ig_info["date"] == d:
                        for eg_amt in existing_groups.values():
                            if eg_amt == ig_info["total"]:
                                return {
                                    "status": "warning",
                                    "message": f"コピー先に重複の可能性がある支出が見つかりました（{d}・¥{ig_info['total']:,}）。続行しますか？",
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
            
        res = dest_session.post(payment_url, data=payload)
        
        if res.status_code != 200:
            err_msg = f"Failed to register item '{item.name}': {res.text}"
            print(err_msg)
            errors.append(err_msg)
        else:
            success_count += 1
            
    return {
        "status": "success" if len(errors) == 0 else "partial_success",
        "success_count": success_count,
        "failed_count": len(errors),
        "errors": errors
    }

class GeminiCredentialsRequest(BaseModel):
    gemini_api_key: str

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

class ZaimCredentialsRequest(BaseModel):
    account_id: Optional[str] = None  # None/empty means new account
    name: str = "Default Account"
    consumer_key: str
    consumer_secret: str
    token: str
    token_secret: str

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
    cache_key = f"{user_id}_{target_id}"
    if cache_key in MASTER_DATA_CACHE:
        del MASTER_DATA_CACHE[cache_key]
    
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
        cache_key = f"{user_id}_{account_id}"
        if cache_key in MASTER_DATA_CACHE:
            del MASTER_DATA_CACHE[cache_key]
            
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
        keys_to_delete = [k for k in MASTER_DATA_CACHE.keys() if k.startswith(f"{user_id}_")]
        for k in keys_to_delete:
            del MASTER_DATA_CACHE[k]
            
        return {"status": "success", "message": "User data completely removed."}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete user data.")
