from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager

from middleware.cors import setup_cors
from middleware.rate_limiter import RateLimiterMiddleware
from middleware.audit_middleware import AuditMiddleware
from routes.health import router as health_router
from routes.auth import router as auth_router
from routes.vault import router as vault_router
from routes.dashboard import router as dashboard_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="OPSVAULT API",
    description="Enterprise Password Manager — Zero-Knowledge Vault",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

setup_cors(app)
app.add_middleware(AuditMiddleware)
app.add_middleware(RateLimiterMiddleware)

API_PREFIX = "/api/v1"

app.include_router(health_router, prefix=API_PREFIX)
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(vault_router, prefix=API_PREFIX)
app.include_router(dashboard_router, prefix=API_PREFIX)
