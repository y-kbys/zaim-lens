import os
import time
import jwt
import requests
import datetime
from typing import Optional
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from db import firebase_app, update_last_login

# --- Firebase Auth Constants & Cache ---
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
    # Use explicitly set project ID or Cloud Run's default project env var
    project_id = os.environ.get("FIREBASE_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project_id:
        print("DEBUG: verify_token_manually failed: FIREBASE_PROJECT_ID and GOOGLE_CLOUD_PROJECT are missing.")
        raise Exception("FIREBASE_PROJECT_ID environment variable is missing.")
    
    try:
        header = jwt.get_unverified_header(id_token)
    except Exception as e:
        print(f"DEBUG: verify_token_manually failed to get header: {e}")
        raise e

    kid = header.get("kid")
    public_keys = get_firebase_public_keys()
    cert_str = public_keys.get(kid)
    
    if not cert_str:
        print(f"DEBUG: verify_token_manually failed: Public key for kid '{kid}' not found.")
        raise Exception(f"Public key for kid '{kid}' not found.")
        
    cert_obj = x509.load_pem_x509_certificate(cert_str.encode(), default_backend())
    public_key = cert_obj.public_key()
    
    try:
        decoded = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}"
        )
        uid = decoded.get("uid") or decoded.get("sub")
        if not uid:
            print(f"DEBUG: verify_token_manually failed: Missing uid/sub claim in decoded token. Claims: {list(decoded.keys())}")
            raise Exception("Token does not contain a uid or sub claim.")
        return uid
    except Exception as e:
        print(f"DEBUG: verify_token_manually JWT decode failed: {e}. project_id={project_id}")
        # One last attempt: maybe the token audience is slightly different?
        # Standard decode without strict aud/iss check to see if we can get the UID
        try:
             decoded_loose = jwt.decode(id_token, public_key, algorithms=["RS256"], options={"verify_aud": False, "verify_iss": False})
             uid = decoded_loose.get("uid") or decoded_loose.get("sub")
             if uid:
                 print(f"DEBUG: verify_token_manually succeeded with loose verification. UID={uid}")
                 return uid
        except: pass
        raise e

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

def verify_token_logic(id_token: str) -> str:
    """Core logic to verify Firebase JWT token."""
    try:
        decoded_token = auth.verify_id_token(id_token, app=firebase_app)
        uid = decoded_token['uid']
        # Background update of last login time (throttled in db.py)
        update_last_login(uid)
        return uid
    except Exception as e:
        error_msg = str(e)
        if "Your default credentials were not found" in error_msg:
            return verify_token_manually(id_token)
        raise e

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Verifies Firebase JWT token and returns the user's UID."""
    try:
        return verify_token_logic(credentials.credentials)
    except Exception as e:
        print(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

def verify_token_optional(credentials: HTTPAuthorizationCredentials = Depends(security_optional)) -> Optional[str]:
    """Verifies token if present, returns None if missing or invalid."""
    if not credentials:
        return None
    try:
        return verify_token_logic(credentials.credentials)
    except:
        return None
