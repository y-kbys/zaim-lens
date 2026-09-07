from fastapi.testclient import TestClient

import routers.gemini as gemini_router
from main import app
from services.auth import verify_token

client = TestClient(app)

# 認証のモック
async def mock_verify_token():
    return "test_user_id"

app.dependency_overrides[verify_token] = mock_verify_token

def test_get_gemini_credentials_not_configured(monkeypatch):
    monkeypatch.setattr(gemini_router, "get_user_config", lambda uid: {})

    response = client.get("/api/gemini/credentials")
    assert response.status_code == 200
    data = response.json()
    assert data["is_configured"] is False
    assert data["api_key_last_4"] == ""

def test_get_gemini_credentials_configured(monkeypatch):
    monkeypatch.setattr(gemini_router, "get_user_config", lambda uid: {
        "gemini_api_key": "AIzaSyDummySecretKey1234"
    })

    response = client.get("/api/gemini/credentials")
    assert response.status_code == 200
    data = response.json()
    assert data["is_configured"] is True
    assert data["api_key_last_4"] == "1234"

def test_save_and_delete_gemini_credentials(monkeypatch):
    saved_config = {}

    def mock_get(uid):
        return saved_config

    def mock_save(uid, conf):
        nonlocal saved_config
        saved_config = conf

    monkeypatch.setattr(gemini_router, "get_user_config", mock_get)
    monkeypatch.setattr(gemini_router, "save_user_config", mock_save)

    # Save
    post_res = client.post("/api/gemini/credentials", json={"gemini_api_key": "new_secret_key_5678"})
    assert post_res.status_code == 200
    assert post_res.json()["status"] == "success"
    assert saved_config.get("gemini_api_key") == "new_secret_key_5678"

    # Delete
    del_res = client.delete("/api/gemini/credentials")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"
    assert "gemini_api_key" not in saved_config
