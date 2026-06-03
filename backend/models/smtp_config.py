from sqlalchemy import Column, String, Integer, DateTime, func
from sqlalchemy.dialects.mysql import TINYINT
from database import Base


class SmtpConfig(Base):
    __tablename__ = "smtp_configs"

    uuid     = Column(String(36), primary_key=True, nullable=False)
    host     = Column(String(255), nullable=False, default="")
    port     = Column(Integer, nullable=False, default=587)
    username = Column(String(255), nullable=False, default="")
    # Encrypted with Fernet before storage
    password = Column(String(255), nullable=False, default="")
    from_email = Column(String(255), nullable=False, default="")
    from_name  = Column(String(100), nullable=False, default="OPSVAULT")
    use_tls  = Column(TINYINT(1), nullable=False, default=1)
    use_ssl  = Column(TINYINT(1), nullable=False, default=0)
    enabled  = Column(TINYINT(1), nullable=False, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
