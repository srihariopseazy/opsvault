"""Async email service — sends transactional emails via aiosmtplib.

All sends are logged to EmailLog. If SMTP is not configured or disabled,
the call is a no-op (status=skipped). Notification preferences are checked
before sending — if the user has opted out, the email is skipped.
"""
import uuid as _uuid
import traceback
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.email_log import EmailLog, EmailStatus
from models.notification_preference import NotificationPreference

# Preference field that maps template → NotificationPreference column
_TEMPLATE_TO_PREF: dict[str, str] = {
    "new_device_login":           "new_device_login",
    "master_password_changed":    "master_password_changed",
    "send_item_viewed":           "send_item_viewed",
    "org_invite":                 "org_invites",
    "org_invite_accepted":        "org_invites",
    "org_invite_rejected":        "org_invites",
    "emergency_access_invite":    "emergency_access",
    "emergency_access_accepted":  "emergency_access",
    "emergency_access_initiated": "emergency_access",
    "emergency_access_approved":  "emergency_access",
    "emergency_access_rejected":  "emergency_access",
    # smtp_test has no preference gate
}

# ── HTML templates ────────────────────────────────────────────────────────────

_BASE_STYLE = """
<style>
  body { margin:0; padding:0; background:#0f0f1a; font-family:'Segoe UI',Arial,sans-serif; }
  .wrap { max-width:560px; margin:32px auto; background:#1a1a2e; border-radius:12px;
          overflow:hidden; border:1px solid #2a2a4a; }
  .header { background:#4f46e5; padding:28px 32px; text-align:center; }
  .logo { color:#fff; font-size:22px; font-weight:700; letter-spacing:2px; }
  .body { padding:32px; color:#c8c8e0; font-size:15px; line-height:1.6; }
  .body h2 { color:#fff; margin:0 0 16px; font-size:18px; }
  .highlight { color:#a5b4fc; font-weight:600; }
  .btn { display:inline-block; margin:8px 6px 0 0; padding:11px 22px;
         border-radius:8px; font-size:14px; font-weight:600;
         text-decoration:none; }
  .btn-primary { background:#4f46e5; color:#fff; }
  .btn-danger  { background:#dc2626; color:#fff; }
  .divider { border:none; border-top:1px solid #2a2a4a; margin:24px 0; }
  .footer { padding:20px 32px; text-align:center; font-size:12px; color:#555578; }
  .alert { background:#1e2a1e; border:1px solid #2d4a2d; border-radius:8px;
           padding:14px 16px; margin:16px 0; color:#86efac; font-size:14px; }
  .warning { background:#2a1e1e; border:1px solid #4a2d2d; border-radius:8px;
             padding:14px 16px; margin:16px 0; color:#fca5a5; font-size:14px; }
  .meta { background:#16162a; border-radius:8px; padding:14px 16px;
          margin:16px 0; font-size:13px; color:#9494b8; }
  .meta span { color:#c8c8e0; }
</style>
"""

def _wrap(content: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8">{_BASE_STYLE}</head>
<body>
  <div class="wrap">
    <div class="header"><div class="logo">OPSVAULT</div></div>
    <div class="body">{content}</div>
    <div class="footer">This is an automated message from OPSVAULT. Do not reply to this email.</div>
  </div>
</body></html>"""


def _render(template_name: str, ctx: dict) -> tuple[str, str]:
    """Return (subject, html_body) for the given template and context."""

    frontend_url = ctx.get("frontend_url", "")

    if template_name == "org_invite":
        subject = f"You've been invited to join {ctx['org_name']} on OPSVAULT"
        body = _wrap(f"""
            <h2>You have a new invitation</h2>
            <p><span class="highlight">{ctx['inviter_name']}</span> ({ctx['inviter_email']})
            has invited you to join the organization
            <span class="highlight">{ctx['org_name']}</span> on OPSVAULT.</p>
            <p>Your role will be: <span class="highlight">{ctx.get('role','member')}</span></p>
            <hr class="divider">
            <p>Log in to your OPSVAULT account to accept or decline this invitation.</p>
            <a href="{frontend_url}/organizations" class="btn btn-primary">View Invitation</a>
        """)

    elif template_name == "org_invite_accepted":
        subject = f"{ctx['member_name']} accepted your invitation to {ctx['org_name']}"
        body = _wrap(f"""
            <h2>Invitation accepted</h2>
            <div class="alert">
              <span class="highlight">{ctx['member_name']}</span> ({ctx['member_email']})
              has accepted your invitation to join <span class="highlight">{ctx['org_name']}</span>.
            </div>
            <p>They now have <span class="highlight">{ctx.get('role','member')}</span> access to
            the organization.</p>
            <a href="{frontend_url}/organizations" class="btn btn-primary">View Organization</a>
        """)

    elif template_name == "org_invite_rejected":
        subject = f"{ctx['member_name']} declined your invitation to {ctx['org_name']}"
        body = _wrap(f"""
            <h2>Invitation declined</h2>
            <p><span class="highlight">{ctx['member_name']}</span> ({ctx['member_email']})
            has declined your invitation to join
            <span class="highlight">{ctx['org_name']}</span>.</p>
            <p>You can invite them again or invite someone else from the Organizations page.</p>
            <a href="{frontend_url}/organizations" class="btn btn-primary">Manage Organization</a>
        """)

    elif template_name == "emergency_access_invite":
        subject = f"{ctx['grantor_name']} wants to add you as an emergency contact"
        body = _wrap(f"""
            <h2>Emergency access invitation</h2>
            <p><span class="highlight">{ctx['grantor_name']}</span> ({ctx['grantor_email']})
            has designated you as an emergency contact on OPSVAULT.</p>
            <div class="meta">
              <b>What is emergency access?</b><br>
              Emergency access lets a trusted person request access to your vault in an emergency.
              The account owner can approve or reject the request. If not rejected within the
              wait period, access is granted automatically.
            </div>
            <p>Wait period: <span class="highlight">{ctx.get('wait_time_days', 7)} day(s)</span></p>
            <p>Log in to OPSVAULT to accept or decline this request.</p>
            <a href="{frontend_url}/emergency-access" class="btn btn-primary">Review Request</a>
        """)

    elif template_name == "emergency_access_accepted":
        subject = f"{ctx['grantee_name']} accepted your emergency access request"
        body = _wrap(f"""
            <h2>Emergency access accepted</h2>
            <div class="alert">
              <span class="highlight">{ctx['grantee_name']}</span> ({ctx['grantee_email']})
              has accepted your emergency access designation.
            </div>
            <p>They can now initiate emergency access recovery if needed. You will be notified
            and can reject the request within the configured wait period.</p>
            <a href="{frontend_url}/emergency-access" class="btn btn-primary">Manage Emergency Access</a>
        """)

    elif template_name == "emergency_access_initiated":
        subject = "Emergency access has been requested for your account"
        body = _wrap(f"""
            <h2>⚠ Emergency access requested</h2>
            <div class="warning">
              <span class="highlight">{ctx['grantee_name']}</span> ({ctx['grantee_email']})
              has initiated an emergency access recovery request for your account.
            </div>
            <div class="meta">
              <b>Time remaining before auto-approval:</b>
              <span>{ctx.get('wait_time_days', 7)} day(s)</span><br>
              <b>Initiated at:</b> <span>{ctx.get('initiated_at', '')}</span>
            </div>
            <p>If this was not authorized, <strong>log in immediately</strong> and reject the request.</p>
            <a href="{frontend_url}/emergency-access" class="btn btn-danger">Review &amp; Reject</a>
        """)

    elif template_name == "emergency_access_approved":
        subject = "Emergency access has been granted"
        body = _wrap(f"""
            <h2>Emergency access granted</h2>
            <div class="alert">
              Your emergency access request for <span class="highlight">{ctx['grantor_name']}</span>'s
              vault has been approved.
            </div>
            <p>You now have <span class="highlight">{ctx.get('access_type','view')}</span> access
            to their vault.</p>
            <a href="{frontend_url}/emergency-access" class="btn btn-primary">View Vault</a>
        """)

    elif template_name == "emergency_access_rejected":
        subject = "Emergency access request declined"
        body = _wrap(f"""
            <h2>Emergency access declined</h2>
            <p><span class="highlight">{ctx['grantor_name']}</span> has declined your emergency
            access recovery request.</p>
            <p>If you believe this is an error, please contact them directly.</p>
        """)

    elif template_name == "new_device_login":
        subject = "New login from an unrecognized device"
        body = _wrap(f"""
            <h2>New sign-in detected</h2>
            <div class="warning">
              A new login to your OPSVAULT account was detected from an unrecognized device.
            </div>
            <div class="meta">
              <b>Time:</b> <span>{ctx.get('timestamp','')}</span><br>
              <b>IP address:</b> <span>{ctx.get('ip_address','Unknown')}</span><br>
              <b>Device:</b> <span>{ctx.get('user_agent','Unknown')}</span>
            </div>
            <p>If this was you, no action is needed. If you don't recognize this activity,
            log in immediately and revoke all sessions.</p>
            <a href="{frontend_url}/session-management" class="btn btn-danger">Review Sessions</a>
        """)

    elif template_name == "send_item_viewed":
        subject = "Your Send item was accessed"
        body = _wrap(f"""
            <h2>Send item accessed</h2>
            <div class="alert">
              Your Send item has been accessed for the first time.
            </div>
            <div class="meta">
              <b>Item:</b> <span>{ctx.get('send_name','(encrypted)')}</span><br>
              <b>Time:</b> <span>{ctx.get('timestamp','')}</span><br>
              <b>Access count:</b> <span>{ctx.get('access_count',1)}</span>
            </div>
            <a href="{frontend_url}/send-items" class="btn btn-primary">Manage Sends</a>
        """)

    elif template_name == "master_password_changed":
        subject = "Your master password was changed"
        body = _wrap(f"""
            <h2>Master password changed</h2>
            <div class="warning">
              Your OPSVAULT master password was recently changed.
            </div>
            <div class="meta">
              <b>Time:</b> <span>{ctx.get('timestamp','')}</span><br>
              <b>IP address:</b> <span>{ctx.get('ip_address','Unknown')}</span>
            </div>
            <p>If you made this change, no action is needed.</p>
            <p>If you did <strong>not</strong> make this change, your account may be compromised.
            Contact support immediately.</p>
            <a href="{frontend_url}/session-management" class="btn btn-danger">Secure My Account</a>
        """)

    elif template_name == "account_deleted":
        subject = "Your OPSVAULT account has been deleted"
        body = _wrap(f"""
            <h2>Account deleted</h2>
            <p>Your OPSVAULT account and all associated data have been permanently deleted.</p>
            <p>If you did not request this, please contact support immediately.</p>
        """)

    elif template_name == "smtp_test":
        subject = "OPSVAULT SMTP Test"
        body = _wrap(f"""
            <h2>SMTP configuration test</h2>
            <div class="alert">
              Your SMTP settings are configured correctly. OPSVAULT can send emails.
            </div>
            <p>This is a test message sent from OPSVAULT to confirm your email configuration.</p>
        """)

    else:
        subject = f"OPSVAULT notification: {template_name}"
        body = _wrap(f"<h2>Notification</h2><p>{template_name}</p>")

    return subject, body


# ── Email sender ──────────────────────────────────────────────────────────────

async def _check_pref(
    user_uuid: Optional[str],
    template_name: str,
    db: AsyncSession,
) -> bool:
    """Return True if the notification should be sent (preference is enabled or no gate)."""
    pref_field = _TEMPLATE_TO_PREF.get(template_name)
    if not pref_field or not user_uuid:
        return True

    result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_uuid == user_uuid
        )
    )
    pref = result.scalar_one_or_none()
    if not pref:
        return True  # default: send

    return bool(getattr(pref, pref_field, 1))


async def _log(
    to_email: str,
    subject: str,
    template_name: str,
    status: EmailStatus,
    user_uuid: Optional[str],
    error: Optional[str],
    db: AsyncSession,
) -> None:
    entry = EmailLog(
        uuid=str(_uuid.uuid4()),
        to_email=to_email,
        subject=subject,
        template=template_name,
        status=status,
        error_message=error,
        user_uuid=user_uuid,
    )
    db.add(entry)
    await db.flush()


async def send_email(
    to_email: str,
    template_name: str,
    context: dict,
    db: AsyncSession,
    user_uuid: Optional[str] = None,
) -> None:
    """Send an email using the configured SMTP settings.

    Logs to EmailLog regardless of outcome. Silently no-ops if SMTP is
    not configured or disabled, or if the user has opted out.
    """
    from services.smtp_config_service import SmtpConfigService

    # Preference check
    if not await _check_pref(user_uuid, template_name, db):
        subject, _ = _render(template_name, context)
        await _log(to_email, subject, template_name, EmailStatus.skipped, user_uuid, "User opted out", db)
        return

    cfg = await SmtpConfigService.get_config(db)

    subject, html_body = _render(template_name, context)

    if not cfg.enabled or not cfg.host or not cfg.from_email:
        await _log(to_email, subject, template_name, EmailStatus.skipped, user_uuid, "SMTP not configured", db)
        return

    try:
        plain_password = SmtpConfigService.decrypt_password(cfg.password) if cfg.password else ""

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{cfg.from_name} <{cfg.from_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        smtp_kwargs: dict = {
            "hostname": cfg.host,
            "port": cfg.port,
            "use_tls": bool(cfg.use_ssl),   # SSL wraps the whole connection
            "start_tls": bool(cfg.use_tls), # STARTTLS upgrades after connect
        }
        if cfg.username and plain_password:
            smtp_kwargs["username"] = cfg.username
            smtp_kwargs["password"] = plain_password

        await aiosmtplib.send(msg, **smtp_kwargs)
        await _log(to_email, subject, template_name, EmailStatus.sent, user_uuid, None, db)

    except Exception:
        err = traceback.format_exc(limit=3)
        await _log(to_email, subject, template_name, EmailStatus.failed, user_uuid, err[:1000], db)
