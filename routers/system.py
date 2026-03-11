import os
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from services.auth import verify_token
from services.zaim_client import clear_master_data_cache
from db import delete_user_config

router = APIRouter()

@router.get("/", response_class=HTMLResponse)
async def read_index():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return "index.html not found in static/"

@router.get("/api/config")
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

@router.delete("/api/user")
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
