from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
import logging

logger = logging.getLogger("opsvault.audit")


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/v1/"):
            logger.info(
                "%s %s %s %s",
                request.method,
                request.url.path,
                response.status_code,
                request.client.host if request.client else "-",
            )
        return response
