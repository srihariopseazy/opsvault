from pydantic import BaseModel
from typing import Optional, Any


class MatchedItemResponse(BaseModel):
    uuid: str
    name: str          # encrypted cipherstring — client decrypts
    item_data: Any     # encrypted — client decrypts and filters by URI
    favorite: bool

    model_config = {"from_attributes": True}


class AutofillLogRequest(BaseModel):
    item_uuid: str
    url: Optional[str] = None


class ExtensionSettingsResponse(BaseModel):
    email: str
    name: str
    totp_enabled: bool
