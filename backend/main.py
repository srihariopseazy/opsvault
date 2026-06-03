from fastapi import FastAPI
from contextlib import asynccontextmanager

from middleware.cors import setup_cors
from middleware.rate_limiter import RateLimiterMiddleware
from middleware.audit_middleware import AuditMiddleware
from routes.health import router as health_router
from routes.auth import router as auth_router
from routes.vault import router as vault_router
from routes.dashboard import router as dashboard_router
from routes.folders import router as folders_router
from routes.settings import router as settings_router
from routes.sessions import router as sessions_router
from routes.organizations import orgs_router, invites_router
from routes.collections import router as collections_router
from routes.emergency_access import router as emergency_access_router
from routes.send import router as send_router
from routes.generator_history import router as generator_history_router
from routes.notifications import router as notifications_router
from routes.admin import router as admin_router
from routes.org_policies import router as org_policies_router
from routes.org_events import router as org_events_router
from routes.smtp_config import router as smtp_config_router
from routes.notification_preferences import router as notif_prefs_router
from routes.reports import router as reports_router
from routes.api_keys import router as api_keys_router
from routes.org_api_keys import router as org_api_keys_router
from routes.webhooks import router as webhooks_router
from routes.sso import router as sso_router
from routes.directory import router as directory_router
from routes.devices import router as devices_router


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

app.include_router(health_router,            prefix=API_PREFIX)
app.include_router(auth_router,              prefix=API_PREFIX)
app.include_router(vault_router,             prefix=API_PREFIX)
app.include_router(dashboard_router,         prefix=API_PREFIX)
app.include_router(folders_router,           prefix=API_PREFIX)
app.include_router(settings_router,          prefix=API_PREFIX)
app.include_router(sessions_router,          prefix=API_PREFIX)
app.include_router(orgs_router,              prefix=API_PREFIX)
app.include_router(invites_router,           prefix=API_PREFIX)
app.include_router(collections_router,       prefix=API_PREFIX)
app.include_router(emergency_access_router,  prefix=API_PREFIX)
app.include_router(send_router,              prefix=API_PREFIX)
app.include_router(generator_history_router, prefix=API_PREFIX)
app.include_router(notifications_router,     prefix=API_PREFIX)
app.include_router(admin_router,             prefix=API_PREFIX)
app.include_router(org_policies_router,      prefix=API_PREFIX)
app.include_router(org_events_router,        prefix=API_PREFIX)
app.include_router(smtp_config_router,       prefix=API_PREFIX)
app.include_router(notif_prefs_router,       prefix=API_PREFIX)
app.include_router(reports_router,           prefix=API_PREFIX)
app.include_router(api_keys_router,          prefix=API_PREFIX)
app.include_router(org_api_keys_router,      prefix=API_PREFIX)
app.include_router(webhooks_router,          prefix=API_PREFIX)
app.include_router(sso_router,               prefix=API_PREFIX)
app.include_router(directory_router,         prefix=API_PREFIX)
app.include_router(devices_router,           prefix=API_PREFIX)
