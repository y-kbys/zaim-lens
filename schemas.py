from typing import List, Optional

from pydantic import BaseModel, Field


# --- Receipt Analysis Models ---
class ReceiptItem(BaseModel):
    name: str
    price: int
    category_id: int
    genre_id: int

class ReceiptParserResult(BaseModel):
    date: str = Field(
        default="",
        description="購入日（YYYY-MM-DD形式）。画像内に明確な日付が記載されていない場合は、推測せず必ず空文字 \"\" とすること。"
    )
    store: str = Field(
        default="",
        description="店舗名。不明な場合は空文字 \"\" とすること。"
    )
    items: List[ReceiptItem]
    point_usage: int = Field(
        default=0,
        description="ポイント利用額。ポイント利用がなければ 0 とすること。"
    )

# --- API Request Models ---
class ParseRequest(BaseModel):
    image_base64: str
    account_id: Optional[str] = None

class RegisterRequest(BaseModel):
    receipt_data: ReceiptParserResult
    force: bool = False
    from_account_id: Optional[int] = None
    target_account_id: str = "1"
    receipt_id: Optional[int] = None

class CopyItem(BaseModel):
    mapping: int = 1
    category_id: int
    genre_id: int
    amount: int
    date: str
    name: str
    place: Optional[str] = None
    comment: Optional[str] = None
    group_id: Optional[int] = None
    from_account_id: Optional[int] = None

class CopyRequest(BaseModel):
    source_account_id: str
    destination_account_id: str
    from_account_id: Optional[int] = None
    items_to_copy: List[CopyItem]
    force: bool = False

# --- Credential Models ---
class GeminiCredentialsRequest(BaseModel):
    gemini_api_key: str

class ZaimCredentialsRequest(BaseModel):
    account_id: Optional[str] = None  # None/empty means new account
    name: str = "Default Account"
    consumer_key: str
    consumer_secret: str
    token: str
    token_secret: str

class ZaimCredentialsResponse(BaseModel):
    id: str
    name: str
    is_configured: bool = True
    consumer_key_last_4: Optional[str] = None
    token_last_4: Optional[str] = None

# --- Other Models ---
class ZaimAccount(BaseModel):
    id: int
    name: str

class ZaimAccountUpdateRequest(BaseModel):
    name: str
