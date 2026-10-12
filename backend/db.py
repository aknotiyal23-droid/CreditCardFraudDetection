import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, Float, String, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in .env file")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

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


print("✅ PostgreSQL database engine ready!") 
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, Float, String, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in .env file")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

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
print("✅ PostgreSQL database engine ready!")
Base.metadata.create_all(bind=engine)
