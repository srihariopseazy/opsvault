from pydantic import BaseModel
from typing import Optional


class SmtpConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None
    enabled: Optional[bool] = None


class SmtpConfigResponse(BaseModel):
    uuid: str
    host: str
    port: int
    username: str
    password: str          # always "********" if set, "" if unset
    from_email: str
    from_name: str
    use_tls: bool
    use_ssl: bool
    enabled: bool


class SmtpTestRequest(BaseModel):
    to_email: str


class SmtpTestResponse(BaseModel):
    success: bool
    message: str
