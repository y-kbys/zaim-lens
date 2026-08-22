import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app
from services.auth import verify_token

client = TestClient(app)

# Override verify_token to simulate authenticated user "test_user_123"
app.dependency_overrides[verify_token] = lambda: "test_user_123"

def test_zaim_status_api():
    mock_config = {
        "accounts": {
            "1": {"id": "1", "name": "Main Zaim", "token": "tok1", "token_secret": "sec1"},
            "2": {"id": "2", "name": "Sub Zaim", "token": "tok2", "token_secret": "sec2"}
        }
    }
    with patch("routers.zaim.get_user_config", return_value=mock_config):
        response = client.get("/api/zaim/status")
        assert response.status_code == 200
        data = response.json()
        assert len(data["accounts"]) == 2
        assert data["accounts"][0]["name"] == "Main Zaim"
        assert data["accounts"][0]["connected"] is True

def test_get_accounts_api():
    mock_config = {
        "accounts": {
            "1": {"id": "1", "name": "Main Zaim"}
        }
    }
    with patch("routers.zaim.get_user_config", return_value=mock_config):
        response = client.get("/api/accounts")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Main Zaim"

def test_get_zaim_credentials_masked():
    mock_config = {
        "accounts": {
            "1": {
                "id": "1",
                "name": "Secure Account",
                "consumer_key": "CK_1234567890",
                "consumer_secret": "SECRET_SUPER_CONFIDENTIAL",
                "token": "TOK_ABCDEFGHIJKL",
                "token_secret": "TOKEN_SECRET_CONFIDENTIAL"
            }
        }
    }
    with patch("routers.zaim.get_user_config", return_value=mock_config):
        response = client.get("/api/zaim/credentials/1")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "1"
        assert data["name"] == "Secure Account"
        assert data["is_configured"] is True
        assert data["consumer_key_last_4"] == "7890"
        assert data["token_last_4"] == "IJKL"
        # Ensure raw secret is not present in response
        assert "consumer_secret" not in data
        assert "token_secret" not in data

def test_get_zaim_credentials_not_found():
    with patch("routers.zaim.get_user_config", return_value={"accounts": {}}):
        response = client.get("/api/zaim/credentials/999")
        assert response.status_code == 404

def test_save_zaim_credentials():
    mock_config = {"accounts": {}}
    with patch("routers.zaim.get_user_config", return_value=mock_config), \
         patch("routers.zaim.save_user_config") as mock_save, \
         patch("routers.zaim.clear_zaim_master_data_db"):
        
        payload = {
            "name": "New Account",
            "consumer_key": "my_ckey",
            "consumer_secret": "my_csecret",
            "token": "my_token",
            "token_secret": "my_tsecret"
        }
        response = client.post("/api/zaim/credentials", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        mock_save.assert_called_once()

def test_update_zaim_account_name():
    mock_config = {
        "accounts": {
            "1": {"id": "1", "name": "Old Name"}
        }
    }
    with patch("routers.zaim.get_user_config", return_value=mock_config), \
         patch("routers.zaim.save_user_config") as mock_save:
        
        response = client.patch("/api/zaim/credentials/1/name", json={"name": "Updated Name"})
        assert response.status_code == 200
        assert mock_config["accounts"]["1"]["name"] == "Updated Name"
        mock_save.assert_called_once()

def test_delete_zaim_account():
    mock_config = {
        "accounts": {
            "1": {"id": "1", "name": "To Delete"}
        }
    }
    with patch("routers.zaim.get_user_config", return_value=mock_config), \
         patch("routers.zaim.save_user_config") as mock_save, \
         patch("routers.zaim.clear_zaim_master_data_db"):
        
        response = client.delete("/api/zaim/disconnect/1")
        assert response.status_code == 200
        assert "1" not in mock_config["accounts"]
        mock_save.assert_called_once()

def test_register_expense_duplicate_warning():
    mock_config = {
        "accounts": {
            "1": {"id": "1", "token": "tok", "token_secret": "sec"}
        }
    }
    with patch("routers.zaim.get_user_config", return_value=mock_config), \
         patch("routers.zaim.get_zaim_session_wrapper"), \
         patch("routers.zaim.check_zaim_duplicate", return_value=True):
        
        payload = {
            "receipt_data": {
                "date": "2026-08-22",
                "store": "Coffee Shop",
                "items": [{"name": "Latte", "price": 500, "category_id": 101, "genre_id": 10101}],
                "point_usage": 0
            },
            "force": False,
            "target_account_id": "1"
        }
        response = client.post("/api/register", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "warning"
        assert data["duplicate_found"] is True

def test_register_expense_success_force():
    mock_config = {
        "accounts": {
            "1": {"id": "1", "token": "tok", "token_secret": "sec"}
        }
    }
    with patch("routers.zaim.get_user_config", return_value=mock_config), \
         patch("routers.zaim.get_zaim_session_wrapper"), \
         patch("services.zaim_service.register_receipt_items", return_value=2):
        
        payload = {
            "receipt_data": {
                "date": "2026-08-22",
                "store": "Coffee Shop",
                "items": [
                    {"name": "Latte", "price": 500, "category_id": 101, "genre_id": 10101}
                ],
                "point_usage": 100
            },
            "force": True,
            "target_account_id": "1"
        }
        response = client.post("/api/register", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["registered_count"] == 2

def test_copy_history_success():
    mock_config = {
        "accounts": {
            "1": {"id": "1", "token": "tok1", "token_secret": "sec1"},
            "2": {"id": "2", "token": "tok2", "token_secret": "sec2"}
        }
    }
    with patch("routers.zaim.get_user_config", return_value=mock_config), \
         patch("routers.zaim.get_zaim_session_wrapper"), \
         patch("routers.zaim.check_zaim_duplicate", return_value=False), \
         patch("services.zaim_service.register_receipt_items", return_value=2):
        
        payload = {
            "source_account_id": "1",
            "destination_account_id": "2",
            "items_to_copy": [
                {
                    "category_id": 101,
                    "genre_id": 10101,
                    "amount": 1000,
                    "date": "2026-08-22",
                    "name": "Lunch",
                    "group_id": 555
                },
                {
                    "category_id": 101,
                    "genre_id": 10101,
                    "amount": 200,
                    "date": "2026-08-22",
                    "name": "Tea",
                    "group_id": 555
                }
            ],
            "force": False
        }
        response = client.post("/api/copy", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["success_count"] == 2
