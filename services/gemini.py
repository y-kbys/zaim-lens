import base64
from typing import List, Dict, Any
from pydantic import BaseModel
from google import genai
from google.genai import types, errors
from fastapi import HTTPException

class ReceiptItem(BaseModel):
    name: str
    price: int
    category_id: int
    genre_id: int

class ReceiptParserResult(BaseModel):
    date: str
    store: str
    items: List[ReceiptItem]
    point_usage: int

async def analyze_receipt(image_base64: str, user_gemini_key: str, master_data_context: str) -> Dict[str, Any]:
    """
    Parses a receipt image using Gemini API and returns the result as a dictionary.
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

    try:
        image_part = types.Part.from_bytes(data=decoded_image_data, mime_type="image/jpeg")

        async def run_gemini(model_name: str) -> ReceiptParserResult:
            client = genai.Client(api_key=user_gemini_key)
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=[prompt, image_part],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ReceiptParserResult,
                )
            )
            return ReceiptParserResult.model_validate_json(response.text)

        try:
            # Default to the highly accurate model
            gemini_result = await run_gemini("gemini-flash-latest")
        except Exception as e:
            print(f"Fallback initiated due to error with gemini-flash-latest: {e}")
            # Fallback to the lite model
            gemini_result = await run_gemini("gemini-2.5-flash-lite")
        
        return gemini_result.model_dump()
        
    except errors.APIError as e:
        print(f"Gemini APIError: {e}")
        if e.code == 429:
            raise HTTPException(status_code=429, detail="Geminiの実行回数制限（レートリミット）に達しました。しばらく時間を置いてから再度お試しください。")
        raise HTTPException(status_code=500, detail=f"レシートの解析に失敗しました。詳細: {e.message}")
    except Exception as e:
        print(f"Error calling Gemini: {e}")
        raise HTTPException(status_code=500, detail=f"レシートの解析に失敗しました。Geminiからの応答が正しくないか、サーバーエラーが発生しました。詳細: {str(e)}")
