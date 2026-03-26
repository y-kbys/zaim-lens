import base64
from typing import List, Dict, Any
from schemas import ReceiptItem, ReceiptParserResult
from google import genai
from google.genai import types, errors
from fastapi import HTTPException

# 先頭から順にフォールバック
GEMINI_MODEL_CHAIN = [
    "gemini-3.1-flash-lite-preview",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest",
]


async def analyze_receipt(image_base64: str, user_gemini_key: str, master_data_context: str) -> Dict[str, Any]:
    """
    Parses a receipt image using a chain of Gemini models and returns the result as a dictionary.
    """
    if ";" in image_base64 and "base64," in image_base64:
        image_base64 = image_base64.split("base64,")[1]
        
    try:
        decoded_image_data = base64.b64decode(image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid image base64 data")

    prompt = f"""これは紙のレシートまたはオンラインストアやアプリの購入履歴画面のスクリーンショットである。
UIのノイズを無視し、純粋な購入品名と金額、そしてもしあればポイント利用額（`point_usage`）を抽出せよ。ポイント利用がなければ `point_usage` は 0 とすること。
購入日（`date`）はYYYY-MM-DD形式にすること。店舗名（`store`）も推測可能な限り抽出すること。
さらに、以下のZaimのカテゴリ＆ジャンル一覧から、各品目に最も適した `category_id` と `genre_id` を推論して `items` 内に含めること。
出力は指定されたJSONスキーマに厳格に従うこと。

{master_data_context}"""

    image_part = types.Part.from_bytes(data=decoded_image_data, mime_type="image/jpeg")
    client = genai.Client(api_key=user_gemini_key)
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=ReceiptParserResult,
    )

    last_error = None
    for model_name in GEMINI_MODEL_CHAIN:
        try:
            print(f"DEBUG: Attempting Gemini analysis with model: {model_name}")
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=[prompt, image_part],
                config=config
            )
            # Validate and return on first success
            result = ReceiptParserResult.model_validate_json(response.text)
            return result.model_dump()
            
        except Exception as e:
            last_error = e
            print(f"DEBUG: Model {model_name} failed: {str(e)}")
            # Handle rate limiting specifically: if 429, we might want to try other models 
            # as different models/tiers might have different limits, so we continue the loop.
            continue

    # If all models in the chain fail, handle the error
    if isinstance(last_error, errors.APIError):
        if last_error.code == 429:
            raise HTTPException(
                status_code=429, 
                detail="Geminiの実行回数制限（レートリミット）に達しました。しばらく時間を置いてから再度お試しください。"
            )
        raise HTTPException(
            status_code=500, 
            detail=f"レシートの解析に失敗しました。詳細: {last_error.message}"
        )
    
    raise HTTPException(
        status_code=500, 
        detail=f"レシートの解析に失敗しました。Geminiからの応答が正しくないか、サーバーエラーが発生しました。詳細: {str(last_error)}"
    )

