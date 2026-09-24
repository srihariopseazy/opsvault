#!/usr/bin/env python3
"""
Read-only investigation script — DOES NOT MODIFY ANYTHING.

Background:
Before commit f659630 ("Require SECRET_KEY from environment, derive SMTP
key independently"), smtp_configs.password was encrypted with a Fernet key
derived as base64_urlsafe(sha256(SECRET_KEY)). After that commit, the app
unconditionally derives the Fernet key via HKDF-SHA256 from the independent
SMTP_ENCRYPTION_KEY instead (see backend/services/smtp_config_service.py,
_fernet_key()). No migration re-encrypted existing rows when the scheme
changed, so any smtp_configs row written before that commit is now
undecryptable by the running app until it's re-encrypted under the new
scheme.

This script only SELECTs smtp_configs.password and attempts to decrypt it
in-memory using the OLD scheme, to confirm whether a given candidate value
for the historical SECRET_KEY is the one that produced the stored
ciphertext. It prints only success/failure and the resulting plaintext
(if successful) — it never writes to the database and never touches the
new (SMTP_ENCRYPTION_KEY / HKDF) scheme.

Usage:
    # Everything via env vars:
    DATABASE_URL='mysql+pymysql://user:pass@host:3306/opsvault' \\
    OLD_SECRET_KEY='<candidate historical SECRET_KEY value>' \\
    python backend/scripts/decrypt_test.py

    # Or via CLI args instead:
    python backend/scripts/decrypt_test.py \\
        --database-url 'mysql+pymysql://user:pass@host:3306/opsvault' \\
        --old-secret-key '<candidate historical SECRET_KEY value>'

Notes:
    - DATABASE_URL must use a *synchronous* driver (this script uses plain
      SQLAlchemy Core, not the app's async engine) — e.g. `mysql+pymysql://`
      rather than the app's usual `mysql+aiomysql://`. Swap the scheme if
      your environment only has a different sync driver installed
      (`mysql+mysqldb://`, etc.).
    - Requires: pip install sqlalchemy pymysql cryptography
    - No credentials are hardcoded anywhere in this file — both the DB
      connection string and the candidate SECRET_KEY must be supplied by
      the caller via env var or CLI arg.
"""
import argparse
import base64
import hashlib
import os
import sys


def derive_old_fernet_key(secret_key: str) -> bytes:
    """Reproduce the pre-f659630 scheme: base64_urlsafe(sha256(SECRET_KEY))."""
    digest = hashlib.sha256(secret_key.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Attempt to decrypt smtp_configs.password with the OLD (pre-HKDF) Fernet scheme."
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="Sync DB URL, e.g. mysql+pymysql://user:pass@host:3306/opsvault. Falls back to $DATABASE_URL.",
    )
    parser.add_argument(
        "--old-secret-key",
        default=os.environ.get("OLD_SECRET_KEY"),
        help="Candidate historical SECRET_KEY value to test. Falls back to $OLD_SECRET_KEY.",
    )
    args = parser.parse_args()

    if not args.database_url:
        print("ERROR: no DB connection string given (--database-url or $DATABASE_URL)", file=sys.stderr)
        return 1
    if not args.old_secret_key:
        print("ERROR: no candidate SECRET_KEY given (--old-secret-key or $OLD_SECRET_KEY)", file=sys.stderr)
        return 1

    from sqlalchemy import create_engine, text
    from cryptography.fernet import Fernet, InvalidToken

    engine = create_engine(args.database_url)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT uuid, password FROM smtp_configs")).fetchall()

    if not rows:
        print("No rows found in smtp_configs. Nothing to test.")
        return 0

    fernet = Fernet(derive_old_fernet_key(args.old_secret_key))

    any_success = False
    for row in rows:
        cfg_uuid, encrypted = row[0], row[1]
        if not encrypted:
            print(f"[{cfg_uuid}] password column is empty — nothing to decrypt.")
            continue
        try:
            plaintext = fernet.decrypt(encrypted.encode()).decode()
            any_success = True
            print(f"[{cfg_uuid}] DECRYPT SUCCEEDED with old-scheme key derived from the given SECRET_KEY.")
            print(f"[{cfg_uuid}] plaintext: {plaintext!r}")
        except InvalidToken:
            print(f"[{cfg_uuid}] DECRYPT FAILED (InvalidToken) — wrong candidate key, or not old-scheme Fernet data.")
        except Exception as exc:
            print(f"[{cfg_uuid}] DECRYPT FAILED ({type(exc).__name__}: {exc})")

    return 0 if any_success else 2


if __name__ == "__main__":
    raise SystemExit(main())
