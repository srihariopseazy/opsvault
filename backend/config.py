from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    SECRET_KEY: str = "opsvault_super_secret_key_minimum_32_characters_long"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    DATABASE_URL: str = "mysql+aiomysql://opsvault_user:opsvault_password@opsvault_mysql:3306/opsvault"
    REDIS_URL: str = "redis://opsvault_redis:6379/0"
    FRONTEND_URL: str = "http://localhost:8080"

    MYSQL_HOST: str = "opsvault_mysql"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "opsvault_user"
    MYSQL_PASSWORD: str = "opsvault_password"
    MYSQL_DATABASE: str = "opsvault"

    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
