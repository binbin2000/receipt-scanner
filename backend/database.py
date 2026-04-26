import os
from sqlalchemy import create_engine, Column, Integer, Numeric, Date, Text, LargeBinary, String, DateTime, Boolean, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://receipt_user:receipt_pass@postgres:5432/receipts_db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(Integer, primary_key=True, index=True)
    user_name = Column(String(255), nullable=True)
    store_name = Column(String(255), nullable=True)
    amount_gross = Column(Numeric(10, 2), nullable=True)   # Totalt inkl. moms
    amount_net = Column(Numeric(10, 2), nullable=True)     # Exkl. moms
    vat_amount = Column(Numeric(10, 2), nullable=True)     # Momsbelopp
    vat_rate = Column(Numeric(5, 2), nullable=True)        # Momssats i % (t.ex. 25.00)
    raw_ocr_response = Column(Text, nullable=True)         # Råa Claude-svaret (JSON) för framtida omanalys
    receipt_date = Column(Date, nullable=True)
    comment = Column(Text, nullable=True)
    image_data = Column(LargeBinary, nullable=True)
    image_filename = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_deleted = Column(Boolean, default=False, nullable=False, server_default='false')


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Kolumner som ska finnas – (namn, SQL-typ)
REQUIRED_COLUMNS = [
    ("user_name",    "VARCHAR(255)"),
    ("store_name",   "VARCHAR(255)"),
    ("amount_gross", "NUMERIC(10,2)"),
    ("amount_net",   "NUMERIC(10,2)"),
    ("vat_amount",   "NUMERIC(10,2)"),
    ("vat_rate",          "NUMERIC(5,2)"),
    ("raw_ocr_response",  "TEXT"),
    ("receipt_date",      "DATE"),
    ("comment",      "TEXT"),
    ("image_data",   "BYTEA"),
    ("image_filename","VARCHAR(255)"),
    ("created_at",   "TIMESTAMP"),
    ("is_deleted",   "BOOLEAN NOT NULL DEFAULT FALSE"),
]


def create_tables():
    """Skapa tabeller om de inte finns, och lägg till saknade kolumner i befintliga."""
    Base.metadata.create_all(bind=engine)

    # Lägg till nya kolumner i befintlig tabell utan att radera data
    with engine.connect() as conn:
        for col_name, col_type in REQUIRED_COLUMNS:
            try:
                conn.execute(text(
                    f"ALTER TABLE receipts ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
                ))
            except Exception:
                pass  # Kolumnen finns redan eller annan harmlös konflikt

        # Migrera gammal "amount"-kolumn till "amount_gross" om den finns
        try:
            conn.execute(text(
                "UPDATE receipts SET amount_gross = amount WHERE amount_gross IS NULL AND amount IS NOT NULL"
            ))
        except Exception:
            pass

        conn.commit()
