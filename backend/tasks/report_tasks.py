"""Celery tasks for scheduled report generation and delivery."""
import asyncio
import logging

from celery_app import celery_app

logger = logging.getLogger("opsvault.tasks.reports")


@celery_app.task(name="tasks.send_scheduled_reports")
def send_scheduled_reports():
    """Find all due scheduled reports, generate them, and email to recipients."""
    logger.info("Running scheduled report task")
    try:
        asyncio.run(_async_process())
    except Exception as exc:
        logger.exception("Scheduled report task failed: %s", exc)


async def _async_process():
    from database import AsyncSessionLocal
    from services.report_service import process_due_reports

    async with AsyncSessionLocal() as db:
        try:
            count = await process_due_reports(db)
            await db.commit()
            logger.info("Processed %d scheduled reports", count)
        except Exception:
            await db.rollback()
            raise
