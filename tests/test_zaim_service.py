from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from services.zaim_client import (
    check_zaim_duplicate,
    fetch_zaim_accounts_raw,
    get_zaim_master_data,
    get_zaim_session,
)
from services.zaim_service import register_receipt_items


def test_get_zaim_session_individual_consumer_key_priority():
    accounts_config = {
        "1": {
            "id": "1",
            "name": "Custom Key Account",
            "consumer_key": "custom_key",
            "consumer_secret": "custom_secret",
            "token": "token_123",
            "token_secret": "secret_123"
        }
    }
    with patch("services.zaim_client.OAuth1Session") as mock_session_class:
        _ = get_zaim_session("1", "user_1", accounts_config)
        mock_session_class.assert_called_once_with(
            "custom_key",
            client_secret="custom_secret",
            resource_owner_key="token_123",
            resource_owner_secret="secret_123"
        )

def test_get_zaim_session_fallback_to_system_keys():
    accounts_config = {
        "1": {
            "id": "1",
            "name": "Default Key Account",
            "token": "token_123",
            "token_secret": "secret_123"
        }
    }
    with patch("services.zaim_client.ZAIM_CONSUMER_KEY", "sys_key"), \
         patch("services.zaim_client.ZAIM_CONSUMER_SECRET", "sys_secret"), \
         patch("services.zaim_client.OAuth1Session") as mock_session_class:
        _ = get_zaim_session("1", "user_1", accounts_config)
        mock_session_class.assert_called_once_with(
            "sys_key",
            client_secret="sys_secret",
            resource_owner_key="token_123",
            resource_owner_secret="secret_123"
        )

def test_get_zaim_session_account_not_found():
    accounts_config = {}
    with pytest.raises(HTTPException) as exc_info:
        get_zaim_session("non_existent", "user_1", accounts_config)
    assert exc_info.value.status_code == 400

def test_get_zaim_session_token_missing():
    accounts_config = {
        "1": {
            "id": "1",
            "name": "Incomplete Account"
        }
    }
    with patch("services.zaim_client.ZAIM_CONSUMER_KEY", "sys_key"), \
         patch("services.zaim_client.ZAIM_CONSUMER_SECRET", "sys_secret"):
        with pytest.raises(HTTPException) as exc_info:
            get_zaim_session("1", "user_1", accounts_config)
        assert exc_info.value.status_code == 400

def test_check_zaim_duplicate_found():
    mock_session = MagicMock()
    mock_res = MagicMock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "money": [
            {"id": 1, "mode": "payment", "receipt_id": 1001, "amount": 500},
            {"id": 2, "mode": "payment", "receipt_id": 1001, "amount": 300},
            {"id": 3, "mode": "payment", "receipt_id": 0, "amount": 200}
        ]
    }
    mock_session.get.return_value = mock_res

    # Receipt 1001 total is 800
    assert check_zaim_duplicate(mock_session, "2026-08-22", 800) is True
    # Single item without receipt_id (manual_3) is 200
    assert check_zaim_duplicate(mock_session, "2026-08-22", 200) is True
    # No group with total 999
    assert check_zaim_duplicate(mock_session, "2026-08-22", 999) is False

def test_register_receipt_items_success():
    mock_session = MagicMock()
    items = [
        {"category_id": 101, "genre_id": 10101, "amount": 500, "name": "Apple"},
        {"category_id": 101, "genre_id": 10101, "amount": -100, "name": "ポイント利用"}
    ]
    with patch("services.zaim_service.register_payment_item", return_value=True) as mock_register:
        success_count = register_receipt_items(
            session=mock_session,
            items=items,
            date="2026-08-22",
            store_name="Supermarket",
            from_account_id=1,
            receipt_id=9999
        )
        assert success_count == 2
        assert mock_register.call_count == 2

def test_fetch_zaim_accounts_raw_active_filter():
    mock_session = MagicMock()
    mock_res = MagicMock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "accounts": [
            {"id": 1, "name": "Wallet", "active": 1},
            {"id": 2, "name": "Old Bank", "active": -1}
        ]
    }
    mock_session.get.return_value = mock_res

    accounts = fetch_zaim_accounts_raw(mock_session)
    assert len(accounts) == 2

def test_get_zaim_master_data_success():
    accounts_config = {
        "1": {
            "id": "1",
            "name": "Default Account",
            "token": "token_123",
            "token_secret": "secret_123"
        }
    }
    mock_session = MagicMock()
    cat_res = MagicMock(status_code=200)
    cat_res.json.return_value = {
        "categories": [
            {"id": 101, "name": "食費", "mode": "payment", "active": 1},
            {"id": 102, "name": "給与", "mode": "income", "active": 1},
            {"id": 103, "name": "旧食費", "mode": "payment", "active": -1}
        ]
    }
    gen_res = MagicMock(status_code=200)
    gen_res.json.return_value = {
        "genres": [
            {"id": 10101, "name": "食料品", "active": 1},
            {"id": 10102, "name": "外食(非アクティブ)", "active": -1}
        ]
    }
    mock_session.get.side_effect = [cat_res, gen_res]

    with patch("services.zaim_client.get_zaim_session", return_value=mock_session):
        data = get_zaim_master_data("1", "user_1", accounts_config)
        assert len(data["categories"]) == 1
        assert data["categories"][0]["id"] == 101
        assert len(data["genres"]) == 1
        assert data["genres"][0]["id"] == 10101
