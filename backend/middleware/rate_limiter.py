from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timedelta, timezone
import hashlib


RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 20     # requests per window for auth endpoints
BLOCKED_DURATION = 300  # 5 minutes

_rate_store: dict = {}


class RateLimiterMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/api/v1/auth/login", "/api/v1/auth/register"):
            client_ip = request.client.host if request.client else "unknown"
            key = hashlib.sha256(f"{client_ip}:{request.url.path}".encode()).hexdigest()
            now = datetime.now(timezone.utc)

            entry = _rate_store.get(key)
            if entry:
                if entry.get("blocked_until") and now < entry["blocked_until"]:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Too many requests. Please try again later.",
                    )
                window_start = entry.get("window_start", now)
                if (now - window_start).total_seconds() > RATE_LIMIT_WINDOW:
                    _rate_store[key] = {"attempts": 1, "window_start": now, "blocked_until": None}
                else:
                    entry["attempts"] += 1
                    if entry["attempts"] > RATE_LIMIT_MAX:
                        entry["blocked_until"] = now + timedelta(seconds=BLOCKED_DURATION)
                        raise HTTPException(
                            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="Too many requests. Please try again later.",
                        )
            else:
                _rate_store[key] = {"attempts": 1, "window_start": now, "blocked_until": None}

        return await call_next(request)
