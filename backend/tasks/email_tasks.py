from celery_app import celery_app
import logging

logger = logging.getLogger("opsvault.tasks")


@celery_app.task(name="tasks.send_welcome_email")
def send_welcome_email(user_email: str, user_name: str):
    logger.info("Sending welcome email to %s", user_email)


@celery_app.task(name="tasks.send_password_change_email")
def send_password_change_email(user_email: str):
    logger.info("Sending password change notification to %s", user_email)
