"""Directory sync service — LDAP, Azure AD (via Graph API), and CSV."""
import uuid
import csv
import io
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.directory import (
    DirectoryConfig, DirectorySyncLog, DirectorySyncUser,
    DirectorySyncType, DirectorySyncStatus, DirectoryUserStatus,
)
from models.user import User
from schemas.directory import (
    DirectoryConfigCreate, DirectoryConfigUpdate,
    DirectoryConfigResponse, DirectorySyncLogResponse,
    DirectorySyncUserResponse, SyncPreviewResponse,
)

logger = logging.getLogger("opsvault.directory")


# ── Config CRUD ───────────────────────────────────────────────────────────────

async def get_directory_config(org_uuid: str, db: AsyncSession) -> Optional[DirectoryConfig]:
    result = await db.execute(select(DirectoryConfig).where(DirectoryConfig.org_id == org_uuid))
    return result.scalar_one_or_none()


async def create_or_update_directory_config(
    org_uuid: str,
    data: DirectoryConfigCreate | DirectoryConfigUpdate,
    db: AsyncSession,
) -> DirectoryConfig:
    existing = await get_directory_config(org_uuid, db)
    if existing:
        for field, value in data.model_dump(exclude_unset=True).items():
            if field in ("is_active", "ldap_use_ssl"):
                setattr(existing, field, 1 if value else 0)
            elif value is not None:
                setattr(existing, field, value)
        existing.updated_at = datetime.now(timezone.utc)
        return existing

    cfg = DirectoryConfig(
        uuid=str(uuid.uuid4()),
        org_id=org_uuid,
        sync_type=getattr(data, "sync_type", "ldap"),
        is_active=1 if getattr(data, "is_active", False) else 0,
        ldap_host=getattr(data, "ldap_host", None),
        ldap_port=getattr(data, "ldap_port", 389),
        ldap_bind_dn=getattr(data, "ldap_bind_dn", None),
        ldap_bind_password=getattr(data, "ldap_bind_password", None),
        ldap_base_dn=getattr(data, "ldap_base_dn", None),
        ldap_user_filter=getattr(data, "ldap_user_filter", "(objectClass=person)"),
        ldap_use_ssl=1 if getattr(data, "ldap_use_ssl", False) else 0,
        azure_tenant_id=getattr(data, "azure_tenant_id", None),
        azure_client_id=getattr(data, "azure_client_id", None),
        azure_client_secret=getattr(data, "azure_client_secret", None),
        azure_group_filter=getattr(data, "azure_group_filter", None),
        google_domain=getattr(data, "google_domain", None),
        google_admin_email=getattr(data, "google_admin_email", None),
        google_service_account_key=getattr(data, "google_service_account_key", None),
        sync_interval_hours=getattr(data, "sync_interval_hours", 24),
    )
    db.add(cfg)
    await db.flush()
    return cfg


async def delete_directory_config(org_uuid: str, db: AsyncSession) -> None:
    cfg = await get_directory_config(org_uuid, db)
    if not cfg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Directory config not found")
    await db.delete(cfg)


# ── Internal: upsert directory user ──────────────────────────────────────────

async def _upsert_dir_user(
    config: DirectoryConfig,
    external_id: str,
    email: str,
    display_name: str,
    now: datetime,
    db: AsyncSession,
) -> tuple[DirectorySyncUser, str]:
    result = await db.execute(
        select(DirectorySyncUser).where(
            and_(
                DirectorySyncUser.config_id == config.id,
                DirectorySyncUser.external_id == external_id,
            )
        )
    )
    dir_user = result.scalar_one_or_none()
    action = "none"

    if dir_user:
        if dir_user.email != email or dir_user.display_name != display_name:
            dir_user.email        = email
            dir_user.display_name = display_name
            dir_user.updated_at   = now
            action = "updated"
        if dir_user.status != DirectoryUserStatus.active:
            dir_user.status     = DirectoryUserStatus.active
            dir_user.updated_at = now
            action = "updated"
        dir_user.last_seen_at = now
    else:
        dir_user = DirectorySyncUser(
            uuid=str(uuid.uuid4()),
            config_id=config.id,
            external_id=external_id,
            email=email,
            display_name=display_name,
            status=DirectoryUserStatus.active,
            last_seen_at=now,
        )
        db.add(dir_user)
        await db.flush()
        action = "added"

    # Try to link to OPSVAULT user
    if not dir_user.user_id:
        u_result = await db.execute(select(User).where(User.email == email.lower()))
        linked = u_result.scalar_one_or_none()
        if linked:
            dir_user.user_id = linked.id

    return dir_user, action


async def _deactivate_missing(
    config: DirectoryConfig,
    seen_external_ids: set,
    now: datetime,
    db: AsyncSession,
) -> int:
    result = await db.execute(
        select(DirectorySyncUser).where(
            and_(
                DirectorySyncUser.config_id == config.id,
                DirectorySyncUser.status == DirectoryUserStatus.active,
            )
        )
    )
    count = 0
    for dir_user in result.scalars().all():
        if dir_user.external_id not in seen_external_ids:
            dir_user.status     = DirectoryUserStatus.deactivated
            dir_user.updated_at = now
            count += 1
    return count


# ── LDAP sync ─────────────────────────────────────────────────────────────────

async def sync_ldap(org_uuid: str, db: AsyncSession) -> DirectorySyncLog:
    config = await get_directory_config(org_uuid, db)
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Directory config not found")
    if config.sync_type != DirectorySyncType.ldap:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Config is not LDAP type")

    started_at = datetime.now(timezone.utc)
    added = updated = deactivated = 0
    errors = []

    try:
        import ldap3
        use_ssl = bool(config.ldap_use_ssl)
        server = ldap3.Server(
            config.ldap_host or "localhost",
            port=config.ldap_port or 389,
            use_ssl=use_ssl,
            get_info=ldap3.ALL,
        )
        conn = ldap3.Connection(
            server,
            user=config.ldap_bind_dn,
            password=config.ldap_bind_password,
            auto_bind=True,
        )

        conn.search(
            search_base=config.ldap_base_dn or "",
            search_filter=config.ldap_user_filter or "(objectClass=person)",
            attributes=["uid", "mail", "cn", "displayName", "sAMAccountName"],
        )
        entries = conn.entries
        conn.unbind()

        now = datetime.now(timezone.utc)
        seen_ids: set = set()

        for entry in entries:
            try:
                ext_id = str(entry["uid"].value if "uid" in entry else entry.entry_dn)
                email  = str(entry["mail"].value if "mail" in entry else "")
                name   = str(
                    entry["displayName"].value if "displayName" in entry
                    else entry["cn"].value if "cn" in entry
                    else ""
                )
                if not email:
                    continue
                seen_ids.add(ext_id)
                _, action = await _upsert_dir_user(config, ext_id, email.lower(), name, now, db)
                if action == "added":
                    added += 1
                elif action == "updated":
                    updated += 1
            except Exception as e:
                errors.append(str(e))

        deactivated = await _deactivate_missing(config, seen_ids, now, db)

    except ImportError:
        errors.append("ldap3 library not installed on server")
    except Exception as e:
        errors.append(str(e))

    sync_status = DirectorySyncStatus.success
    if errors and (added + updated) == 0:
        sync_status = DirectorySyncStatus.failed
    elif errors:
        sync_status = DirectorySyncStatus.partial

    log = DirectorySyncLog(
        uuid=str(uuid.uuid4()),
        config_id=config.id,
        status=sync_status,
        users_added=added,
        users_updated=updated,
        users_deactivated=deactivated,
        errors=errors if errors else None,
        started_at=started_at,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(log)

    config.last_synced_at = datetime.now(timezone.utc)
    await db.flush()
    return log


# ── CSV sync ──────────────────────────────────────────────────────────────────

async def sync_csv(org_uuid: str, csv_content: str, db: AsyncSession) -> DirectorySyncLog:
    config = await get_directory_config(org_uuid, db)
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Directory config not found")

    started_at = datetime.now(timezone.utc)
    added = updated = deactivated = 0
    errors = []
    now = datetime.now(timezone.utc)
    seen_ids: set = set()

    try:
        reader = csv.DictReader(io.StringIO(csv_content))
        for row in reader:
            email        = (row.get("email") or "").strip().lower()
            display_name = (row.get("display_name") or row.get("name") or "").strip()
            external_id  = (row.get("external_id") or email).strip()

            if not email:
                continue
            seen_ids.add(external_id)
            try:
                _, action = await _upsert_dir_user(config, external_id, email, display_name, now, db)
                if action == "added":
                    added += 1
                elif action == "updated":
                    updated += 1
            except Exception as e:
                errors.append(str(e))

        deactivated = await _deactivate_missing(config, seen_ids, now, db)
    except Exception as e:
        errors.append(str(e))

    sync_status = (
        DirectorySyncStatus.failed  if errors and (added + updated) == 0
        else DirectorySyncStatus.partial if errors
        else DirectorySyncStatus.success
    )

    log = DirectorySyncLog(
        uuid=str(uuid.uuid4()),
        config_id=config.id,
        status=sync_status,
        users_added=added,
        users_updated=updated,
        users_deactivated=deactivated,
        errors=errors if errors else None,
        started_at=started_at,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(log)
    config.last_synced_at = now
    await db.flush()
    return log


# ── Preview sync ──────────────────────────────────────────────────────────────

async def preview_sync(org_uuid: str, db: AsyncSession) -> SyncPreviewResponse:
    config = await get_directory_config(org_uuid, db)
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Directory config not found")

    if config.sync_type != DirectorySyncType.ldap:
        return SyncPreviewResponse(users_to_add=0, users_to_update=0, users_to_deactivate=0)

    to_add = to_update = to_deactivate = 0
    sample_adds: list = []
    sample_deactivations: list = []

    try:
        import ldap3
        use_ssl = bool(config.ldap_use_ssl)
        server = ldap3.Server(config.ldap_host or "localhost", port=config.ldap_port or 389, use_ssl=use_ssl)
        conn = ldap3.Connection(server, user=config.ldap_bind_dn, password=config.ldap_bind_password, auto_bind=True)
        conn.search(
            search_base=config.ldap_base_dn or "",
            search_filter=config.ldap_user_filter or "(objectClass=person)",
            attributes=["uid", "mail", "cn"],
        )
        entries = conn.entries
        conn.unbind()

        remote_ids: set = set()
        for entry in entries:
            ext_id = str(entry["uid"].value if "uid" in entry else entry.entry_dn)
            email  = str(entry["mail"].value if "mail" in entry else "")
            if not email:
                continue
            remote_ids.add(ext_id)
            exists = await db.execute(
                select(DirectorySyncUser).where(
                    and_(DirectorySyncUser.config_id == config.id, DirectorySyncUser.external_id == ext_id)
                )
            )
            du = exists.scalar_one_or_none()
            if not du:
                to_add += 1
                if len(sample_adds) < 5:
                    sample_adds.append(email)
            elif du.status != DirectoryUserStatus.active or du.email != email:
                to_update += 1

        active = await db.execute(
            select(DirectorySyncUser).where(
                and_(DirectorySyncUser.config_id == config.id, DirectorySyncUser.status == DirectoryUserStatus.active)
            )
        )
        for du in active.scalars().all():
            if du.external_id not in remote_ids:
                to_deactivate += 1
                if len(sample_deactivations) < 5:
                    sample_deactivations.append(du.email)
    except Exception:
        pass

    return SyncPreviewResponse(
        users_to_add=to_add,
        users_to_update=to_update,
        users_to_deactivate=to_deactivate,
        sample_adds=sample_adds,
        sample_deactivations=sample_deactivations,
    )


# ── Logs & users ──────────────────────────────────────────────────────────────

async def get_sync_logs(org_uuid: str, db: AsyncSession) -> List[DirectorySyncLog]:
    config = await get_directory_config(org_uuid, db)
    if not config:
        return []
    result = await db.execute(
        select(DirectorySyncLog)
        .where(DirectorySyncLog.config_id == config.id)
        .order_by(DirectorySyncLog.created_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())


async def list_directory_users(org_uuid: str, db: AsyncSession) -> List[DirectorySyncUser]:
    config = await get_directory_config(org_uuid, db)
    if not config:
        return []
    result = await db.execute(
        select(DirectorySyncUser)
        .where(DirectorySyncUser.config_id == config.id)
        .order_by(DirectorySyncUser.email)
    )
    return list(result.scalars().all())
