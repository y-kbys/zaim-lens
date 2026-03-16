from typing import List, Optional
from pydantic import BaseModel

# --- Receipt Analysis Models ---
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

# --- Other Models ---
class ZaimAccount(BaseModel):
    id: int
    name: str

class ZaimAccountUpdateRequest(BaseModel):
    name: str
