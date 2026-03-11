import os
from fastapi import APIRouter, HTTPException, Body, Depends
from services.auth import verify_token
from services.gemini import analyze_receipt
from services.zaim_client import get_zaim_master_data_wrapper, get_master_data_from_cache
from schemas import ParseRequest, GeminiCredentialsRequest
from db import get_user_config, save_user_config

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
        master_data_context = get_zaim_master_data_wrapper(target_account_id, user_id, accounts)
        result_dict = await analyze_receipt(request.image_base64, user_gemini_key, master_data_context)
        
        master_data = get_master_data_from_cache(user_id, target_account_id)
        if master_data:
            result_dict["master_categories"] = master_data["categories"]
            result_dict["master_genres"] = master_data["genres"]
        else:
            result_dict["master_categories"] = []
            result_dict["master_genres"] = []
        
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
