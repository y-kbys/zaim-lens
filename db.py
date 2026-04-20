import os
import copy
import base64
import firebase_admin
from firebase_admin import firestore
from cryptography.fernet import Fernet
from dotenv import load_dotenv
import datetime
from typing import Dict, Any

load_dotenv()

import traceback
import hashlib

# --- Firebase Initialization ---
# Cloud Run automatically provides default credentials, but for local tests we explicitly pass Project ID if available.
project_id = os.environ.get("FIREBASE_PROJECT_ID")
if project_id:
    # Explicitly set for other Google libraries that look for this env var
    os.environ["GOOGLE_CLOUD_PROJECT"] = project_id

firebase_app = None
db = None

try:
    if project_id:
        print(f"Initializing Firebase with Project ID: {project_id}")
        firebase_app = firebase_admin.initialize_app(options={'projectId': project_id})
    else:
        print("Initializing Firebase with default project ID")
        firebase_app = firebase_admin.initialize_app()
    
    try:
        db = firestore.client()
    except Exception as fe:
        print(f"Warning: Could not initialize Firestore client safely: {fe}")
        db = None
except ValueError:
    print("Firebase already initialized, getting apps...")
    firebase_app = firebase_admin.get_app()
    try:
        db = firestore.client()
    except:
        db = None
except Exception as e:
    print("FATAL ERROR initializing Firebase:")
    traceback.print_exc()
    firebase_app = None
    db = None

# --- Encryption Initialization ---
raw_key = os.environ.get("ENCRYPTION_KEY")

if not raw_key:
    raise ValueError(
        "CRITICAL: ENCRYPTION_KEY environment variable is missing. "
        "Please set a secure, unique string in your environment variables or .env file."
    )

try:
    # Fernet requires a 32-byte url-safe base64-encoded key. 
    # Hash any input string to 32 bytes to guarantee proper format.
    hashed_key = hashlib.sha256(raw_key.encode('utf-8')).digest()
    fernet_key = base64.urlsafe_b64encode(hashed_key)
    fernet = Fernet(fernet_key)
except Exception as e:
    print("FATAL ERROR initializing Fernet encryption:")
    traceback.print_exc()
    fernet = None

def encrypt_value(value: str) -> str:
    if not value: 
        return value
    return fernet.encrypt(value.encode('utf-8')).decode('utf-8')

def decrypt_value(encrypted_value: str) -> str:
    if not encrypted_value: 
        return encrypted_value
    try:
        return fernet.decrypt(encrypted_value.encode('utf-8')).decode('utf-8')
    except Exception as e:
        print(f"Decryption failed: {e}")
        # Return fallback or raise, depending on preference. Here we return original.
        return encrypted_value

# --- CRUD Operations ---
def get_user_config(user_id: str = "default_user") -> Dict[str, Any]:
    """
    Retrieve user configuration from Firestore and decrypt credentials.
    Returns something like:
    {
      "accounts": {
         "1": { "id": "1", "name": "Default", "consumer_key": "...", ... }
      }
    }
    """
    if db is None:
        print("ERROR: Firestore client (db) is not initialized.")
        return {"accounts": {}}
        
    doc_ref = db.collection("users").document(user_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return {"accounts": {}}
        
    data = doc.to_dict()
    accounts = data.get("accounts", {})
    
    # Decrypt credentials
    for acc_id, acc_data in accounts.items():
        if "consumer_key" in acc_data: acc_data["consumer_key"] = decrypt_value(acc_data["consumer_key"])
        if "consumer_secret" in acc_data: acc_data["consumer_secret"] = decrypt_value(acc_data["consumer_secret"])
        if "token" in acc_data: acc_data["token"] = decrypt_value(acc_data["token"])
        if "token_secret" in acc_data: acc_data["token_secret"] = decrypt_value(acc_data["token_secret"])
        
    if "gemini_api_key" in data:
        data["gemini_api_key"] = decrypt_value(data["gemini_api_key"])
        
    return data

def save_user_config(user_id: str, config: Dict[str, Any]):
    """
    Encrypt credentials and save user configuration to Firestore.
    """
    data_to_save = copy.deepcopy(config)
    accounts = data_to_save.get("accounts", {})
    
    # Encrypt credentials
    for acc_id, acc_data in accounts.items():
        if "consumer_key" in acc_data: acc_data["consumer_key"] = encrypt_value(acc_data.get("consumer_key", ""))
        if "consumer_secret" in acc_data: acc_data["consumer_secret"] = encrypt_value(acc_data.get("consumer_secret", ""))
        if "token" in acc_data: acc_data["token"] = encrypt_value(acc_data.get("token", ""))
        if "token_secret" in acc_data: acc_data["token_secret"] = encrypt_value(acc_data.get("token_secret", ""))
        
    if "gemini_api_key" in data_to_save:
        data_to_save["gemini_api_key"] = encrypt_value(data_to_save.get("gemini_api_key", ""))
        
    if db is None:
        print("ERROR: Cannot save config. Firestore client (db) is not initialized.")
        return
        
    doc_ref = db.collection("users").document(user_id)
    doc_ref.set(data_to_save)

def delete_user_config(user_id: str) -> bool:
    """
    Permanently delete the user's data from Firestore.
    """
    if db is None:
        print("ERROR: Cannot delete config. Firestore client (db) is not initialized.")
        return False
        
    try:
        doc_ref = db.collection("users").document(user_id)
        doc_ref.delete()
        print(f"Data for user {user_id} deleted successfully.")
        return True
    except Exception as e:
        print(f"Failed to delete user {user_id}: {e}")
        return False

# --- Zaim Master Data Cache ---
def get_zaim_master_data_from_db(user_id: str, account_id: str) -> Dict[str, Any]:
    """
    Retrieve Zaim master data (categories, genres) from Firestore.
    """
    if db is None:
        print("ERROR: Firestore client (db) is not initialized.")
        return {}
        
    doc_ref = db.collection("users").document(user_id).collection("zaim_master_data").document(str(account_id))
    doc = doc_ref.get()
    
    if not doc.exists:
        return {}
        
    return doc.to_dict()

def save_zaim_master_data_to_db(user_id: str, account_id: str, data: Dict[str, Any]):
    """
    Save Zaim master data to Firestore, automatically adding last_updated_at.
    """
    if db is None:
        print("ERROR: Cannot save master data. Firestore client (db) is not initialized.")
        return
        
    data_to_save = copy.deepcopy(data)
    data_to_save["last_updated_at"] = datetime.datetime.utcnow().isoformat()
    
    doc_ref = db.collection("users").document(user_id).collection("zaim_master_data").document(str(account_id))
    doc_ref.set(data_to_save)

def clear_zaim_master_data_db(user_id: str, account_id: str = None) -> bool:
    """
    Delete Zaim master data from Firestore.
    """
    if db is None:
        print("ERROR: Cannot delete master data. Firestore client (db) is not initialized.")
        return False
        
    try:
        master_data_ref = db.collection("users").document(user_id).collection("zaim_master_data")
        if account_id:
            doc_ref = master_data_ref.document(str(account_id))
            doc_ref.delete()
        else:
            # Delete all documents in the collection
            docs = master_data_ref.stream()
            for doc in docs:
                doc.reference.delete()
        return True
    except Exception as e:
        print(f"Failed to delete master data cache for user {user_id}: {e}")
        return False

def update_last_login(user_id: str):
    """
    Updates the last_login_at field in Firestore for the given user,
    throttled to once every 24 hours.
    """
    if db is None:
        return

    try:
        doc_ref = db.collection("users").document(user_id)
        doc = doc_ref.get()
        
        now = datetime.datetime.utcnow()
        now_str = now.isoformat()
        
        if doc.exists:
            data = doc.to_dict()
            last_login = data.get("last_login_at")
            if last_login:
                try:
                    last_login_dt = datetime.datetime.fromisoformat(last_login)
                    # Skip update if last login was less than 24 hours ago
                    if now - last_login_dt < datetime.timedelta(hours=24):
                        return
                except Exception:
                    pass # If format is invalid, proceed to update
            
            doc_ref.update({"last_login_at": now_str})
        else:
            # If the user document doesn't exist yet, create it with this field
            doc_ref.set({"last_login_at": now_str}, merge=True)
            
        print(f"Updated last_login_at for user: {user_id}")
    except Exception as e:
        print(f"Failed to update last_login_at for user {user_id}: {e}")
