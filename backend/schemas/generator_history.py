from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class GeneratorHistorySave(BaseModel):
    password: str   # encrypted with user's symmetricKey


class GeneratorHistoryResponse(BaseModel):
    uuid: str
    password: str   # encrypted — client decrypts
    created_at: Optional[datetime] = None
