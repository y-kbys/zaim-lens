import time
from typing import List, Dict, Any, Optional
from requests_oauthlib import OAuth1Session
from services.zaim_client import register_payment_item

def register_receipt_items(
    session: OAuth1Session,
    items: List[Dict[str, Any]],
    date: str,
    store_name: Optional[str] = None,
    from_account_id: Optional[int] = None,
    receipt_id: Optional[int] = None
) -> int:
    """
    Registers a list of items as a single receipt in Zaim.
    
    Args:
        session: Active OAuth1Session.
        items: List of item dictionaries (category_id, genre_id, amount, name, place, comment).
        date: The date of the receipt.
        store_name: The name of the store (place).
        from_account_id: The internal account ID.
        receipt_id: Optional pseudo-ID for grouping. If not provided, a timestamp is used.
        
    Returns:
        Number of successfully registered items.
    """
    if not receipt_id:
        receipt_id = int(time.time())
    
    success_count = 0
    
    # [IMPORTANT] To prevent reverse ordering in Zaim UI, we register items in reverse order.
    # Zaim usually displays most recently added items at the top of the day.
    for item in reversed(items):
        payload = {
            "mapping": 1,
            "category_id": item.get("category_id"),
            "genre_id": item.get("genre_id"),
            "amount": item.get("amount") or item.get("price"), # Support both keys
            "date": date,
            "name": item.get("name"),
            "receipt_id": receipt_id,
        }
        
        # Override item level info with function level info if provided
        final_from_account_id = item.get("from_account_id") or from_account_id
        if final_from_account_id is not None and str(final_from_account_id) != "":
            payload["from_account_id"] = final_from_account_id
            
        final_place = item.get("place") or store_name
        if final_place:
            payload["place"] = final_place
            
        if item.get("comment"):
            payload["comment"] = item.get("comment")
            
        if register_payment_item(session, payload):
            success_count += 1
            
    return success_count
