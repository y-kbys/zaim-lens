import os
import copy
import base64
import firebase_admin
from firebase_admin import firestore
from cryptography.fernet import Fernet
from dotenv import load_dotenv
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
        
    if db is None:
        print("ERROR: Cannot save config. Firestore client (db) is not initialized.")
        return
        
    doc_ref = db.collection("users").document(user_id)
    doc_ref.set(data_to_save)
