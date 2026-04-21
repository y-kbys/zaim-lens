import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.templating import Jinja2Templates
from services.auth import verify_token
from db import delete_user_config, clear_zaim_master_data_db

# Create absolute paths for static files to avoid issues in different execution environments
BASE_DIR = Path(__file__).resolve().parent.parent
ROBOTS_PATH = BASE_DIR / "static" / "robots.txt"
SITEMAP_PATH = BASE_DIR / "static" / "sitemap.xml"

# Log paths for debugging (visible in Cloud Run logs)
print(f"DEBUG: BASE_DIR calculated as: {BASE_DIR}")
print(f"DEBUG: ROBOTS_PATH: {ROBOTS_PATH} (exists: {ROBOTS_PATH.exists()})")

router = APIRouter()
templates = Jinja2Templates(directory="templates")

@router.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "ga_measurement_id": os.environ.get("GA_MEASUREMENT_ID"),
            "developer_emails": os.environ.get("DEVELOPER_EMAILS", ""),
            "app_version": os.environ.get("APP_VERSION", "v1.0.0"),
            "firebase_config": {
                "apiKey": os.environ.get("FIREBASE_API_KEY"),
                "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN"),
                "projectId": os.environ.get("FIREBASE_PROJECT_ID"),
                "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET"),
                "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID"),
                "appId": os.environ.get("FIREBASE_APP_ID"),
                "measurementId": os.environ.get("FIREBASE_MEASUREMENT_ID")
            }
        }
    )

@router.get("/privacy.html", response_class=HTMLResponse)
async def read_privacy(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="privacy.html",
        context={
            "ga_measurement_id": os.environ.get("GA_MEASUREMENT_ID"),
            "developer_emails": os.environ.get("DEVELOPER_EMAILS", "")
        }
    )

@router.get("/terms.html", response_class=HTMLResponse)
async def read_terms(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="terms.html",
        context={
            "ga_measurement_id": os.environ.get("GA_MEASUREMENT_ID"),
            "developer_emails": os.environ.get("DEVELOPER_EMAILS", "")
        }
    )




@router.get("/robots.txt", response_class=FileResponse)
async def read_robots():
    if not ROBOTS_PATH.exists():
        print(f"ERROR: robots.txt not found at {ROBOTS_PATH}")
        raise HTTPException(status_code=404, detail="robots.txt not found")
    return FileResponse(str(ROBOTS_PATH), media_type="text/plain")

@router.get("/sitemap.xml", response_class=FileResponse)
async def read_sitemap():
    if not SITEMAP_PATH.exists():
        print(f"ERROR: sitemap.xml not found at {SITEMAP_PATH}")
        raise HTTPException(status_code=404, detail="sitemap.xml not found")
    return FileResponse(str(SITEMAP_PATH), media_type="application/xml")

@router.get("/api/health")
async def health_check():
    """Lightweight endpoint for Cloud Run keep-warm ping."""
    return {"status": "ok"}


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
        clear_zaim_master_data_db(user_id)
            
        return {"status": "success", "message": "User data completely removed."}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete user data.")
