import base64
import pytest
from fastapi import HTTPException
from routers.gemini import build_prompt_context
from services.gemini import analyze_receipt

def test_build_prompt_context():
    categories = [
        {"id": 101, "name": "食費"},
        {"id": 102, "name": "日用雑貨"},
        {"id": 103, "name": "未分類"}, # ジャンルなし
    ]
    genres = [
        {"id": 10101, "name": "食料品", "category_id": 101},
        {"id": 10102, "name": "外食", "category_id": 101},
        {"id": 10201, "name": "消耗品", "category_id": 102},
    ]
    
    context = build_prompt_context(categories, genres)
    
    assert "【Zaim カテゴリ＆ジャンル一覧】" in context
    assert "カテゴリID: 101 (食費) 含まれるジャンル: ID:10101 (食料品), ID:10102 (外食)" in context
    assert "カテゴリID: 102 (日用雑貨) 含まれるジャンル: ID:10201 (消耗品)" in context
    assert "103" not in context # ジャンルがないものは含まれない

@pytest.mark.asyncio
async def test_base64_invalid_image():
    invalid_base64 = "this_is_not_a_valid_base64!!!"
    with pytest.raises(HTTPException) as exc_info:
        await analyze_receipt(invalid_base64, "dummy_key", "dummy_context")
    
    assert exc_info.value.status_code == 400
    assert "Invalid image base64 data" in exc_info.value.detail
