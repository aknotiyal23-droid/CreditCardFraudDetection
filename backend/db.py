import os
from dotenv import load_dotenv
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    Float,
    String,
    Text,
    DateTime
)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func
from sqlalchemy.engine import make_url

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Use a local SQLite database for development so the API can start without a
# separately installed PostgreSQL server. Deployments can continue to provide
# DATABASE_URL to use PostgreSQL.
if DATABASE_URL and DATABASE_URL.startswith(("postgres://", "postgresql://", "postgresql+psycopg2://")):
    configured_url = make_url(DATABASE_URL)
    if configured_url.host in {"localhost", "127.0.0.1", "::1"}:
        # A local PostgreSQL URL is commonly present in a developer's .env even
        # when the PostgreSQL service is not installed or running.
        DATABASE_URL = None

if not DATABASE_URL:
    DATABASE_URL = f"sqlite:///{(os.path.dirname(__file__) + '/fraud_detection.db').replace(os.sep, '/')}"

# Render PostgreSQL driver configuration
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://",
        "postgresql+psycopg2://",
        1
    )
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://",
        "postgresql+psycopg2://",
        1
    )

engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite:"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


class TransactionRecord(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float)
    risk_score = Column(Float)
    risk_level = Column(String(20))
    prediction = Column(String(20))

    isolation_forest = Column(Float)
    lof = Column(Float)
    one_class_svm = Column(Float)
    autoencoder = Column(Float)

    explanation = Column(Text)

    created_at = Column(
        DateTime,
        server_default=func.now()
    )


Base.metadata.create_all(bind=engine)

print(f"Database engine ready: {'SQLite' if DATABASE_URL.startswith('sqlite:') else 'PostgreSQL'}")
