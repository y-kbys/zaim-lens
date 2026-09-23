import time
from typing import Any, Dict, List, Optional

from requests_oauthlib import OAuth1Session

from services.zaim_client import register_payment_item
from services.zaim_logic import build_payment_payload


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

    # Register items in the order they are provided.
    for item in items:
        payload = build_payment_payload(
            item=item,
            date=date,
            store_name=store_name,
            from_account_id=from_account_id,
            receipt_id=receipt_id
        )

        if register_payment_item(session, payload):
            success_count += 1

    return success_count
