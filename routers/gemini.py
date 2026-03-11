import os
from fastapi import APIRouter, HTTPException, Body, Depends
from services.auth import verify_token
from services.gemini import analyze_receipt
from services.zaim_client import get_zaim_master_data_wrapper
from schemas import ParseRequest, GeminiCredentialsRequest
from db import get_user_config, save_user_config, get_zaim_master_data_from_db, save_zaim_master_data_to_db
import datetime

def get_or_fetch_master_data(user_id: str, account_id: str, accounts: dict):
    master_data = get_zaim_master_data_from_db(user_id, account_id)
    if master_data and "last_updated_at" in master_data:
        try:
            last_updated = datetime.datetime.fromisoformat(master_data["last_updated_at"])
            if datetime.datetime.utcnow() - last_updated < datetime.timedelta(hours=24):
                return master_data
        except Exception:
            pass

    # Cache miss or expired
    fresh_data = get_zaim_master_data_wrapper(account_id, user_id, accounts)
    save_zaim_master_data_to_db(user_id, account_id, fresh_data)
    # The saved data will get last_updated_at added by the db function, but we just need categories/genres here
    return fresh_data

def build_prompt_context(categories: list, genres: list) -> str:
    lines = ["\n【Zaim カテゴリ＆ジャンル一覧】"]
    for cat in categories:
        c_id = cat.get("id")
        c_name = cat.get("name")
        cat_genres = [g for g in genres if g.get("category_id") == c_id]
        if cat_genres:
            g_texts = [f"ID:{g['id']} ({g['name']})" for g in cat_genres]
            lines.append(f"- カテゴリID: {c_id} ({c_name}) 含まれるジャンル: " + ", ".join(g_texts))
    return "\n".join(lines)

router = APIRouter()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

@router.post("/api/parse")
async def parse_screenshot(request: ParseRequest = Body(...), user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    user_gemini_key = config.get("gemini_api_key")
    if not user_gemini_key:
        if GEMINI_API_KEY:
            user_gemini_key = GEMINI_API_KEY
        else:
             raise HTTPException(status_code=400, detail="Gemini API Key is not configured. 歯車アイコンからAPIキーを設定してください。")

    accounts = config.get("accounts", {})
    if not accounts:
        raise HTTPException(status_code=400, detail="Zaim連携が設定されていません。右上のアイコンからZaim連携を行ってください。")

    target_account_id = request.account_id
    if not target_account_id or target_account_id not in accounts:
        target_account_id = list(accounts.keys())[0]

    try:
        master_data = get_or_fetch_master_data(user_id, target_account_id, accounts)
        master_categories = master_data.get("categories", [])
        master_genres = master_data.get("genres", [])
        
        master_data_context = build_prompt_context(master_categories, master_genres)
        result_dict = await analyze_receipt(request.image_base64, user_gemini_key, master_data_context)
        
        result_dict["master_categories"] = master_categories
        result_dict["master_genres"] = master_genres
        
        return result_dict
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        print(f"Unexpected error in parse_screenshot: {e}")
        raise HTTPException(status_code=500, detail=f"予期せぬエラーが発生しました。詳細: {str(e)}")

@router.get("/api/gemini/credentials")
async def get_gemini_credentials(user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    key = config.get("gemini_api_key")
    return {
        "is_configured": bool(key),
        "api_key_last_4": key[-4:] if key and len(key) > 4 else ("*" * len(key) if key else "")
    }

@router.post("/api/gemini/credentials")
async def save_gemini_credentials(req: GeminiCredentialsRequest, user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    config["gemini_api_key"] = req.gemini_api_key
    save_user_config(user_id, config)
    return {"status": "success", "message": "Gemini API key saved successfully."}

@router.delete("/api/gemini/credentials")
async def delete_gemini_credentials(user_id: str = Depends(verify_token)):
    config = get_user_config(user_id)
    if "gemini_api_key" in config:
        del config["gemini_api_key"]
        save_user_config(user_id, config)
    return {"status": "success", "message": "Gemini API key deleted."}
