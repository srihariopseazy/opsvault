import hashlib
import hmac
import secrets
import base64


def generate_secure_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def constant_time_compare(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def hash_value(value: str, salt: str = "") -> str:
    return hashlib.sha256(f"{salt}{value}".encode()).hexdigest()


def hash_ip_for_rate_limit(ip: str, endpoint: str) -> str:
    return hashlib.sha256(f"{ip}:{endpoint}".encode()).hexdigest()


def is_valid_cipher_string(value: str) -> bool:
    if not value or not isinstance(value, str):
        return False
    return value.startswith("2.") and "|" in value
