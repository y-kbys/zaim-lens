import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv
from db import get_user_config, save_user_config, firebase_app
from routers import zaim, gemini, system

load_dotenv()

SESSION_SECRET = os.environ.get("SESSION_SECRET", os.environ.get("ENCRYPTION_KEY", "temporary-secret-for-session"))

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

# --- App Initialization ---
app = FastAPI(title="Zaim Lens")
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# Add SessionMiddleware for OAuth 1.0a request token secret storage
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

# --- Include Routers ---
app.include_router(zaim.router)
app.include_router(gemini.router)
app.include_router(system.router)
