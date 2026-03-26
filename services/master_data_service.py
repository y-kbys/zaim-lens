import datetime
from services.zaim_client import get_zaim_master_data_wrapper

def get_or_fetch_master_data(user_id: str, account_id: str, accounts: dict):
    """
    Fetches Zaim master data directly from the Zaim API.
    Server-side caching has been removed in favor of frontend localStorage caching.
    """
    # Fetch from Zaim API directly
    fresh_data = get_zaim_master_data_wrapper(account_id, user_id, accounts)
    return fresh_data
