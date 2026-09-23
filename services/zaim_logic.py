"""
Pure business logic for Zaim data processing, grouping, validation, and payload formatting.
These functions have no I/O, DB, or external API dependencies, making them fully testable in isolation.
"""

import time
from typing import Any, Dict, List, Optional, Tuple


def is_duplicate_payment(history_items: List[Dict[str, Any]], target_amount: int) -> bool:
    """
    Checks if any receipt group or individual manual payment in the history items matches target_amount.

    Args:
        history_items: List of payment dictionaries from Zaim API response.
        target_amount: The target total amount to check for duplicates.

    Returns:
        True if an existing payment with the same total amount exists, False otherwise.
    """
    groups: Dict[Any, int] = {}
    for h_item in history_items:
        if h_item.get("mode") != "payment":
            continue
        rid = h_item.get("receipt_id")
        if rid is None or rid == 0:
            groups[f"manual_{h_item.get('id')}"] = int(h_item.get("amount", 0))
        else:
            if rid not in groups:
                groups[rid] = 0
            groups[rid] += int(h_item.get("amount", 0))

    return any(amt == target_amount for amt in groups.values())


def calculate_receipt_total_amount(items: List[Any], point_usage: Optional[int] = 0) -> int:
    """
    Calculates the total receipt amount taking point usage into account.

    Args:
        items: List of item objects or dictionaries with a 'price' or 'amount' attribute.
        point_usage: Amount of points used (subtracted from total).

    Returns:
        Total net amount.
    """
    subtotal = 0
    for item in items:
        price = getattr(item, "price", None)
        if price is None and isinstance(item, dict):
            price = item.get("price", item.get("amount", 0))
        subtotal += int(price or 0)

    return subtotal - int(point_usage or 0)


def build_receipt_items(raw_items: List[Any], point_usage: Optional[int] = 0) -> List[Dict[str, Any]]:
    """
    Transforms raw receipt items into normalized dictionaries and injects
    point usage as a negative amount item if present.

    Args:
        raw_items: List of receipt item models or dicts.
        point_usage: Optional point usage amount.

    Returns:
        List of normalized item dictionaries ready for registration.
    """
    items: List[Dict[str, Any]] = []
    for item in raw_items:
        items.append({
            "category_id": getattr(item, "category_id", None) or (item.get("category_id") if isinstance(item, dict) else None),
            "genre_id": getattr(item, "genre_id", None) or (item.get("genre_id") if isinstance(item, dict) else None),
            "amount": getattr(item, "price", None) if getattr(item, "price", None) is not None else (item.get("price", item.get("amount")) if isinstance(item, dict) else 0),
            "name": getattr(item, "name", None) or (item.get("name") if isinstance(item, dict) else "")
        })

    # Add point usage as a negative item if present
    if point_usage and point_usage > 0:
        default_cat = items[0]["category_id"] if len(items) > 0 and items[0]["category_id"] else 101
        default_gen = items[0]["genre_id"] if len(items) > 0 and items[0]["genre_id"] else 10101
        items.append({
            "category_id": default_cat,
            "genre_id": default_gen,
            "amount": -point_usage,
            "name": "ポイント利用"
        })

    return items


def build_payment_payload(
    item: Dict[str, Any],
    date: str,
    store_name: Optional[str] = None,
    from_account_id: Optional[int] = None,
    receipt_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Builds a single Zaim API payment payload dictionary.

    Args:
        item: Item dictionary with category_id, genre_id, amount/price, name, etc.
        date: The date string (YYYY-MM-DD).
        store_name: Optional default store/place name.
        from_account_id: Optional default source account ID.
        receipt_id: Optional pseudo receipt ID.

    Returns:
        Dictionary formatted for Zaim's /v2/home/money/payment API.
    """
    payload: Dict[str, Any] = {
        "mapping": 1,
        "category_id": item.get("category_id"),
        "genre_id": item.get("genre_id"),
        "amount": item.get("amount") if item.get("amount") is not None else item.get("price"),
        "date": date,
        "name": item.get("name"),
        "receipt_id": receipt_id,
    }

    final_from_account_id = item.get("from_account_id") or from_account_id
    if final_from_account_id is not None and str(final_from_account_id).strip() != "":
        payload["from_account_id"] = final_from_account_id

    final_place = item.get("place") or store_name
    if final_place:
        payload["place"] = final_place

    if item.get("comment"):
        payload["comment"] = item.get("comment")

    return payload


def prepare_copy_receipt_groups(
    items_to_copy: List[Any],
    start_timestamp: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Groups copy items by (date, group_id) and assigns unique pseudo receipt_ids.

    Args:
        items_to_copy: List of items to copy (CopyItem models or dicts).
        start_timestamp: Base timestamp for generating unique pseudo receipt IDs.

    Returns:
        List of receipt group dicts containing:
        - 'date': str
        - 'group_id': Any
        - 'receipt_id': int
        - 'items': List[Dict[str, Any]]
        - 'total_amount': int
    """
    receipt_groups: Dict[Tuple[str, Any], List[Any]] = {}

    for idx, item in enumerate(items_to_copy):
        gid = getattr(item, "group_id", None) if not isinstance(item, dict) else item.get("group_id")
        date = getattr(item, "date", None) if not isinstance(item, dict) else item.get("date")

        # If group_id is null, it's a single item, but we group it individually
        effective_gid = gid if gid is not None else f"single_{idx}_{id(item)}"
        key = (date, effective_gid)
        if key not in receipt_groups:
            receipt_groups[key] = []
        receipt_groups[key].append(item)

    groups_result: List[Dict[str, Any]] = []
    group_receipt_id_map: Dict[Any, int] = {}
    last_pseudo_id = start_timestamp if start_timestamp is not None else int(time.time())

    for (date, gid), items in receipt_groups.items():
        if isinstance(gid, int):
            if gid not in group_receipt_id_map:
                new_id = max(int(time.time()), last_pseudo_id + 1)
                group_receipt_id_map[gid] = new_id
                last_pseudo_id = new_id
            receipt_id = group_receipt_id_map[gid]
        else:
            new_id = max(int(time.time()), last_pseudo_id + 1)
            receipt_id = new_id
            last_pseudo_id = new_id

        items_list: List[Dict[str, Any]] = []
        total_amount = 0
        for item in items:
            amount = getattr(item, "amount", None) if not isinstance(item, dict) else item.get("amount")
            items_list.append({
                "category_id": getattr(item, "category_id", None) if not isinstance(item, dict) else item.get("category_id"),
                "genre_id": getattr(item, "genre_id", None) if not isinstance(item, dict) else item.get("genre_id"),
                "amount": amount,
                "name": getattr(item, "name", None) if not isinstance(item, dict) else item.get("name"),
                "place": getattr(item, "place", None) if not isinstance(item, dict) else item.get("place"),
                "comment": getattr(item, "comment", None) if not isinstance(item, dict) else item.get("comment"),
                "from_account_id": getattr(item, "from_account_id", None) if not isinstance(item, dict) else item.get("from_account_id")
            })
            total_amount += int(amount or 0)

        groups_result.append({
            "date": date,
            "group_id": gid,
            "receipt_id": receipt_id,
            "items": items_list,
            "total_amount": total_amount
        })

    return groups_result
