from celery import Celery
from celery.schedules import crontab
from config import get_settings

settings = get_settings()

celery_app = Celery(
    "opsvault",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks.email_tasks", "tasks.report_tasks", "tasks.webhook_tasks", "tasks.sharing_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "send-scheduled-reports": {
            "task": "tasks.send_scheduled_reports",
            "schedule": 3600,
        },
        "expire-vault-shares": {
            "task": "tasks.expire_vault_shares",
            "schedule": 3600,
        },
    },
)
