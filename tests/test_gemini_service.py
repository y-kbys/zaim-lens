import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from google.genai import errors

import services.gemini as gemini_service

# ダミーの画像データ（1x1のGIFをBase64化したもの）
DUMMY_IMAGE_BASE64 = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

MOCK_PARSED_RESPONSE = {
    "date": "2026-08-22",
    "store": "テストスーパー",
    "items": [
        {"name": "牛乳", "price": 200, "category_id": 101, "genre_id": 10101},
        {"name": "食パン", "price": 150, "category_id": 101, "genre_id": 10101}
    ],
    "point_usage": 50
}

@pytest.mark.asyncio
async def test_analyze_receipt_success(monkeypatch):
    mock_response = MagicMock()
    mock_response.text = json.dumps(MOCK_PARSED_RESPONSE)

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("google.genai.Client", return_value=mock_client):
        result = await gemini_service.analyze_receipt(
            DUMMY_IMAGE_BASE64, "dummy_api_key", "dummy_context"
        )

        assert result["date"] == "2026-08-22"
        assert result["store"] == "テストスーパー"
        assert len(result["items"]) == 2
        assert result["items"][0]["name"] == "牛乳"
        assert result["items"][0]["price"] == 200
        assert result["point_usage"] == 50

        # 最初のモデルで成功するため呼び出し回数は1回
        assert mock_client.aio.models.generate_content.call_count == 1

@pytest.mark.asyncio
async def test_analyze_receipt_fallback(monkeypatch):
    mock_response = MagicMock()
    mock_response.text = json.dumps(MOCK_PARSED_RESPONSE)

    mock_client = MagicMock()
    # 1回目は例外、2回目で成功
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=[Exception("Model 1 overloaded"), mock_response]
    )

    with patch("google.genai.Client", return_value=mock_client):
        result = await gemini_service.analyze_receipt(
            DUMMY_IMAGE_BASE64, "dummy_api_key", "dummy_context"
        )

        assert result["store"] == "テストスーパー"
        assert mock_client.aio.models.generate_content.call_count == 2

@pytest.mark.asyncio
async def test_analyze_receipt_rate_limit_429(monkeypatch):
    mock_client = MagicMock()
    # 全モデルで 429 APIError
    api_error = errors.APIError(429, {"error": {"message": "Quota exceeded"}})
    mock_client.aio.models.generate_content = AsyncMock(side_effect=api_error)

    with patch("google.genai.Client", return_value=mock_client):
        with pytest.raises(HTTPException) as exc_info:
            await gemini_service.analyze_receipt(
                DUMMY_IMAGE_BASE64, "dummy_api_key", "dummy_context"
            )

        assert exc_info.value.status_code == 429
        assert "レートリミット" in exc_info.value.detail

@pytest.mark.asyncio
async def test_analyze_receipt_all_fail_500(monkeypatch):
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=Exception("Internal Model Failure")
    )

    with patch("google.genai.Client", return_value=mock_client):
        with pytest.raises(HTTPException) as exc_info:
            await gemini_service.analyze_receipt(
                DUMMY_IMAGE_BASE64, "dummy_api_key", "dummy_context"
            )

        assert exc_info.value.status_code == 500
        assert "レシートの解析に失敗しました" in exc_info.value.detail
