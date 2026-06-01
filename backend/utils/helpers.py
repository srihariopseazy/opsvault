from datetime import datetime, timezone
from typing import Optional
import uuid as uuid_lib


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid_lib.uuid4())


def paginate(query, page: int = 1, per_page: int = 20):
    offset = (page - 1) * per_page
    return query.offset(offset).limit(per_page)


def safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
