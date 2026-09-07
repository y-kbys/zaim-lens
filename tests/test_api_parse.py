from fastapi.testclient import TestClient

import routers.gemini as gemini_router
from main import app
from services.auth import verify_token

client = TestClient(app)

async def mock_verify_token():
    return "test_user_id"

app.dependency_overrides[verify_token] = mock_verify_token

DUMMY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

def test_parse_missing_gemini_api_key(monkeypatch):
    monkeypatch.setattr(gemini_router, "get_user_config", lambda uid: {"accounts": {"1": {}}})
    monkeypatch.setattr(gemini_router, "GEMINI_API_KEY", None)

    response = client.post("/api/parse", json={"image_base64": DUMMY_IMAGE})
    assert response.status_code == 400
    assert "Gemini API Key is not configured" in response.json()["detail"]

def test_parse_missing_zaim_connection(monkeypatch):
    monkeypatch.setattr(gemini_router, "get_user_config", lambda uid: {"gemini_api_key": "test_key", "accounts": {}})

    response = client.post("/api/parse", json={"image_base64": DUMMY_IMAGE})
    assert response.status_code == 400
    assert "Zaim連携が設定されていません" in response.json()["detail"]

def test_parse_success_e2e(monkeypatch):
    mock_config = {
        "gemini_api_key": "user_api_key",
        "accounts": {"1": {"name": "Default Account"}}
    }
    mock_master = {
        "categories": [{"id": 101, "name": "食費"}],
        "genres": [{"id": 10101, "name": "食料品", "category_id": 101}]
    }
    mock_analysis_result = {
        "date": "2026-08-22",
        "store": "スーパーA",
        "items": [{"name": "りんご", "price": 100, "category_id": 101, "genre_id": 10101}],
        "point_usage": 0
    }

    monkeypatch.setattr(gemini_router, "get_user_config", lambda uid: mock_config)
    monkeypatch.setattr(gemini_router, "get_or_fetch_master_data", lambda uid, acc_id, accs: mock_master)

    async def mock_analyze(img, key, ctx):
        assert key == "user_api_key"
        return dict(mock_analysis_result)

    monkeypatch.setattr(gemini_router, "analyze_receipt", mock_analyze)

    response = client.post("/api/parse", json={"image_base64": DUMMY_IMAGE, "account_id": "1"})
    assert response.status_code == 200
    data = response.json()

    assert data["date"] == "2026-08-22"
    assert data["store"] == "スーパーA"
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "りんご"
    assert data["master_categories"] == mock_master["categories"]
    assert data["master_genres"] == mock_master["genres"]
