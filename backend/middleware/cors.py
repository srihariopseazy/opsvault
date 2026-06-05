from fastapi.middleware.cors import CORSMiddleware
from config import get_settings

settings = get_settings()

CORS_ORIGINS = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
    "http://localhost",
]

CORS_ORIGIN_REGEX = r"(chrome-extension|moz-extension)://.*"


def setup_cors(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_origin_regex=CORS_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
