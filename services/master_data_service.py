import datetime
from services.zaim_client import get_zaim_master_data_wrapper
from db import get_zaim_master_data_from_db, save_zaim_master_data_to_db

def get_or_fetch_master_data(user_id: str, account_id: str, accounts: dict):
    """
    Common orchestration logic for Zaim master data caching.
    Check Firestore cache first, then fetch from Zaim API if expired (>24h) or missing.
    """
    # Check Firestore cache directly
    master_data = get_zaim_master_data_from_db(user_id, account_id)
    if master_data and "last_updated_at" in master_data:
        try:
            last_updated = datetime.datetime.fromisoformat(master_data["last_updated_at"])
            # Use UTC for consistency as db.py uses datetime.datetime.utcnow()
            if datetime.datetime.utcnow() - last_updated < datetime.timedelta(hours=24):
                return master_data
        except Exception:
            pass

    # Cache miss or expired, fetch from Zaim API
    fresh_data = get_zaim_master_data_wrapper(account_id, user_id, accounts)
    save_zaim_master_data_to_db(user_id, account_id, fresh_data)
    # The saved data will have last_updated_at added by the db function, but fresh_data returned here is just categories/genres
    return fresh_data
