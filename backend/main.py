import csv
import io
import os
import re
import base64
import json
import logging
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

import anthropic
from PIL import Image
from fastapi import FastAPI, File, Form, UploadFile, Depends, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, create_tables, Receipt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ENABLE_AUTH       = os.getenv("ENABLE_AUTH", "false").lower() == "true"
MAX_UPLOAD_MB     = 20
MAX_UPLOAD_BYTES  = MAX_UPLOAD_MB * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    logger.info("Database tables created/verified.")
    if not ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY saknas! Sätt den i .env eller docker-compose.yml.")
    logger.info(f"ForwardAuth (Authelia): {'aktiverad' if ENABLE_AUTH else 'inaktiverad'}")
    yield


app = FastAPI(title="ReceiptScanner API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Authelia ForwardAuth – hjälpfunktion                                         #
# --------------------------------------------------------------------------- #

def get_auth_user(request: Request) -> dict:
    """
    Läser Authelia ForwardAuth-headers som sätts av reverse proxy efter
    lyckad autentisering:
      Remote-User   → username
      Remote-Name   → visningsnamn
      Remote-Email  → e-post
      Remote-Groups → kommaseparerade grupper
    """
    return {
        "auth_enabled": ENABLE_AUTH,
        "username": request.headers.get("Remote-User"),
        "display_name": request.headers.get("Remote-Name"),
        "email": request.headers.get("Remote-Email"),
        "groups": request.headers.get("Remote-Groups", ""),
    }


def require_auth(request: Request):
    """
    FastAPI-dependency: kastar 401 om ENABLE_AUTH=true men Remote-User-headern
    saknas. Används som ett försvarslager om en request når backends direkt
    utan att gå via Authelia-proxyn.
    """
    if ENABLE_AUTH and not request.headers.get("Remote-User"):
        raise HTTPException(status_code=401, detail="Ej autentiserad")


def to_decimal(v) -> Optional[Decimal]:
    """Konverterar ett tal till Decimal, eller None om värdet saknas."""
    return Decimal(str(v)) if v is not None else None


@app.get("/api/me")
def get_me(request: Request):
    """Returnera inloggad användare (från Authelia headers) eller auth_enabled=False."""
    user = get_auth_user(request)
    if ENABLE_AUTH and not user["username"]:
        raise HTTPException(status_code=401, detail="Ej autentiserad")
    return user


# --------------------------------------------------------------------------- #
# Claude Vision OCR                                                            #
# --------------------------------------------------------------------------- #

OCR_PROMPT = """Du är en expert på att läsa svenska kvitton. Analysera bilden noggrant och extrahera:

1. Butiksnamn / företagsnamn – vanligtvis längst upp på kvittot
2. Datum – ange i formatet YYYY-MM-DD
3. Belopp – identifiera om kvittot visar belopp inkl. moms, exkl. moms, eller båda:
   - amount_gross: totalt belopp inkl. moms (det kunden betalar, "att betala", "total", "summa")
   - amount_net: belopp exkl. moms ("exkl. moms", "netto")
   - vat_amount: momsbeloppet ("moms", "varav moms")
   - vat_rate: momssats i procent (t.ex. 25, 12, eller 6) – vanliga svenska satser är 25%, 12%, 6%

   Om kvittot bara visar ett totalbelopp inkl. moms utan att specificera moms, sätt amount_gross till det beloppet och övriga till null.
   Om du kan räkna ut saknade värden från de som finns (t.ex. netto = brutto - moms), gör det gärna.

4. item_summary: Beskriv vad som köptes med max 10 ord. Nämn bara varorna – inte butiksnamn, datum eller andra detaljer.
   Exempel: "Frukt, mejeri och chark." eller "Lunch och dryck." eller "Bensin 47 liter."
   Om varorna inte går att läsa, sätt till null.

Svara ENBART med giltig JSON (inga andra ord):
{
  "store_name": "ICA Maxi Kungälv",
  "date": "2024-03-15",
  "amount_gross": 249.90,
  "amount_net": 199.92,
  "vat_amount": 49.98,
  "vat_rate": 25,
  "item_summary": "Livsmedel inkl. frukt, mejeri och charkuterier.",
  "confidence": "high",
  "notes": "valfri kommentar om osäkerhet eller om kvittot är svårläst"
}

Om du inte kan hitta ett värde, sätt det till null."""


# Konfigurerbart via .env
IMAGE_MAX_PX  = int(os.getenv("IMAGE_MAX_PX",  "1600"))   # max längsta sida i pixlar
IMAGE_QUALITY = int(os.getenv("IMAGE_QUALITY", "72"))     # JPEG-kvalitet 1–95


def compress_image(image_bytes: bytes) -> tuple[bytes, int, int]:
    """
    Komprimera bild för lagring:
      - Konverterar alltid till JPEG (RGB)
      - Skalar ned om längsta sida > IMAGE_MAX_PX
      - Sparar med IMAGE_QUALITY
    Returnerar (komprimerade_bytes, original_kb, komprimerad_kb).
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    w, h = img.size
    longest = max(w, h)
    if longest > IMAGE_MAX_PX:
        scale = IMAGE_MAX_PX / longest
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=IMAGE_QUALITY, optimize=True)
    compressed = buf.getvalue()

    orig_kb = len(image_bytes) // 1024
    comp_kb = len(compressed) // 1024
    logger.info(f"Bildkomprimering: {orig_kb} KB → {comp_kb} KB "
                f"({100 - int(comp_kb / max(orig_kb, 1) * 100)}% minskning)")
    return compressed, orig_kb, comp_kb


CLAUDE_MAX_BYTES = 4 * 1024 * 1024  # 4 MB med marginal mot Claudes 5 MB-gräns

def prepare_for_ocr(image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    """
    Förbered bilden för Claude OCR med minimal kvalitetsförlust.
    Strategi: behåll originalet om det ryms, annars sänk upplösningen
    stegvis med hög JPEG-kvalitet. Sänk kvaliteten bara som sista utväg.
    Returnerar (bytes, media_type).
    """
    # Steg 1: konvertera format om det behövs (Claude kräver jpeg/png/gif/webp)
    supported = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    ct = content_type.lower()
    if ct in supported and len(image_bytes) <= CLAUDE_MAX_BYTES:
        return image_bytes, ct  # originalet ryms — använd det direkt

    # Öppna och konvertera till RGB JPEG
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = img.size

    # Steg 2: prova progressivt lägre upplösning med hög kvalitet (90)
    for max_px in (4000, 3000, 2400, 2000, 1600):
        longest = max(w, h)
        if longest > max_px:
            scale = max_px / longest
            resized = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        else:
            resized = img
        buf = io.BytesIO()
        resized.save(buf, format="JPEG", quality=90, optimize=True)
        candidate = buf.getvalue()
        if len(candidate) <= CLAUDE_MAX_BYTES:
            logger.info(f"OCR-komprimering: {len(image_bytes)//1024} KB → {len(candidate)//1024} KB (max_px={max_px})")
            return candidate, "image/jpeg"

    # Steg 3: sänk kvaliteten om upplösningsreduktion inte räcker
    resized = img.resize((1600, int(h * 1600 / w)) if w > h else (int(w * 1600 / h), 1600), Image.LANCZOS)
    for quality in (80, 65, 50):
        buf = io.BytesIO()
        resized.save(buf, format="JPEG", quality=quality, optimize=True)
        candidate = buf.getvalue()
        if len(candidate) <= CLAUDE_MAX_BYTES:
            logger.info(f"OCR-komprimering (kvalitet={quality}): {len(image_bytes)//1024} KB → {len(candidate)//1024} KB")
            return candidate, "image/jpeg"

    return candidate, "image/jpeg"  # bästa möjliga vid denna punkt


def run_claude_ocr(image_bytes: bytes, content_type: str) -> dict:
    """Skicka kvittobild till Claude och få tillbaka strukturerad data."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY är inte konfigurerad.")

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Claude accepterar jpeg, png, gif, webp
    media_type_map = {
        "image/jpeg": "image/jpeg",
        "image/jpg": "image/jpeg",
        "image/png": "image/png",
        "image/gif": "image/gif",
        "image/webp": "image/webp",
    }
    media_type = media_type_map.get(content_type.lower(), "image/jpeg")

    # Konvertera till JPEG om formatet inte stöds (t.ex. TIFF, BMP)
    if media_type not in media_type_map.values():
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=95)
        image_bytes = buf.getvalue()
        media_type = "image/jpeg"

    img_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": img_b64,
                        },
                    },
                    {"type": "text", "text": OCR_PROMPT},
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()
    logger.info(f"Claude svar: {raw}")

    # Extrahera JSON även om Claude råkar skriva lite extra text
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"Kunde inte hitta JSON i svaret: {raw}")

    return json.loads(raw[start:end])


# --------------------------------------------------------------------------- #
# Endpoints                                                                    #
# --------------------------------------------------------------------------- #

@app.post("/api/ocr")
async def ocr_receipt(file: UploadFile = File(...), _: None = Depends(require_auth)):
    """Ta emot en kvittobild, kör Claude OCR och returnera extraherade fält."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Filen måste vara en bild.")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Bilden är för stor (max {MAX_UPLOAD_MB} MB).")

    # Förbered bilden för OCR: minimal komprimering, bara nog för att passa under Claudes gräns
    ocr_bytes, ocr_ct = prepare_for_ocr(contents, file.content_type or "image/jpeg")

    # OCR: skicka bilden till Claude
    try:
        result = run_claude_ocr(ocr_bytes, ocr_ct)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Claude OCR misslyckades: {e}")
        raise HTTPException(status_code=500, detail=f"OCR kunde inte köras: {str(e)}")

    # Lagring: komprimera bilden separat för databasen
    compressed, orig_kb, comp_kb = compress_image(contents)
    img_b64 = base64.b64encode(compressed).decode("utf-8")

    return {
        "store_name": result.get("store_name"),
        "amount_gross": result.get("amount_gross"),
        "amount_net": result.get("amount_net"),
        "vat_amount": result.get("vat_amount"),
        "vat_rate": result.get("vat_rate"),
        "date": result.get("date"),
        "confidence": result.get("confidence"),
        "notes": result.get("notes"),
        "item_summary": result.get("item_summary"),
        "raw_ocr_response": json.dumps(result, ensure_ascii=False),
        "image_base64": img_b64,
        "image_content_type": "image/jpeg",   # alltid JPEG efter komprimering
        "filename": file.filename,
        "image_orig_kb": orig_kb,
        "image_comp_kb": comp_kb,
    }


class ReceiptCreate(BaseModel):
    user_name: Optional[str] = None
    store_name: Optional[str] = None
    amount_gross: Optional[float] = None
    amount_net: Optional[float] = None
    vat_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    raw_ocr_response: Optional[str] = None
    receipt_date: Optional[str] = None
    comment: Optional[str] = None
    image_base64: Optional[str] = None
    image_filename: Optional[str] = None
    image_content_type: Optional[str] = None


@app.post("/api/receipts", status_code=201)
def save_receipt(data: ReceiptCreate, db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """Spara ett kvitto till databasen."""
    parsed_date = None
    if data.receipt_date:
        try:
            parsed_date = date.fromisoformat(data.receipt_date)
        except ValueError:
            pass

    image_bytes = None
    if data.image_base64:
        try:
            image_bytes = base64.b64decode(data.image_base64)
            # Komprimera bilden innan lagring (gäller bl.a. manuell uppladdning)
            image_bytes, _, _ = compress_image(image_bytes)
        except Exception:
            pass

    receipt = Receipt(
        user_name=_normalize_name(data.user_name),
        store_name=data.store_name,
        amount_gross=to_decimal(data.amount_gross),
        amount_net=to_decimal(data.amount_net),
        vat_amount=to_decimal(data.vat_amount),
        vat_rate=to_decimal(data.vat_rate),
        raw_ocr_response=data.raw_ocr_response,
        receipt_date=parsed_date,
        comment=data.comment,
        image_data=image_bytes,
        image_filename=data.image_filename,
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)

    return {
        "id": receipt.id,
        "store_name": receipt.store_name,
        "amount_gross": float(receipt.amount_gross) if receipt.amount_gross else None,
        "amount_net": float(receipt.amount_net) if receipt.amount_net else None,
        "vat_amount": float(receipt.vat_amount) if receipt.vat_amount else None,
        "vat_rate": float(receipt.vat_rate) if receipt.vat_rate else None,
        "receipt_date": receipt.receipt_date.isoformat() if receipt.receipt_date else None,
        "comment": receipt.comment,
        "created_at": receipt.created_at.isoformat(),
    }


@app.get("/api/receipts")
def list_receipts(db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """Hämta alla sparade kvitton (utan bilddata)."""
    rows = db.query(Receipt).filter(Receipt.is_deleted == False).order_by(Receipt.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "user_name": _normalize_name(r.user_name),
            "store_name": r.store_name,
            "amount_gross": float(r.amount_gross) if r.amount_gross else None,
            "amount_net": float(r.amount_net) if r.amount_net else None,
            "vat_amount": float(r.vat_amount) if r.vat_amount else None,
            "vat_rate": float(r.vat_rate) if r.vat_rate else None,
            "receipt_date": r.receipt_date.isoformat() if r.receipt_date else None,
            "comment": r.comment,
            "image_filename": r.image_filename,
            "has_image": r.image_data is not None,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


class ReceiptUpdate(BaseModel):
    user_name: Optional[str] = None
    store_name: Optional[str] = None
    amount_gross: Optional[float] = None
    amount_net: Optional[float] = None
    vat_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    receipt_date: Optional[str] = None
    comment: Optional[str] = None


@app.put("/api/receipts/{receipt_id}", status_code=200)
def update_receipt(receipt_id: int, data: ReceiptUpdate, db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """Uppdatera ett befintligt kvitto."""
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id, Receipt.is_deleted == False).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Kvittot hittades inte.")

    receipt.user_name = _normalize_name(data.user_name)
    receipt.store_name = data.store_name
    receipt.amount_gross = to_decimal(data.amount_gross)
    receipt.amount_net = to_decimal(data.amount_net)
    receipt.vat_amount = to_decimal(data.vat_amount)
    receipt.vat_rate = to_decimal(data.vat_rate)
    receipt.comment = data.comment
    if data.receipt_date:
        try:
            receipt.receipt_date = date.fromisoformat(data.receipt_date)
        except ValueError:
            pass
    else:
        receipt.receipt_date = None

    db.commit()
    db.refresh(receipt)
    return {
        "id": receipt.id,
        "user_name": receipt.user_name,
        "store_name": receipt.store_name,
        "amount_gross": float(receipt.amount_gross) if receipt.amount_gross else None,
        "amount_net": float(receipt.amount_net) if receipt.amount_net else None,
        "vat_amount": float(receipt.vat_amount) if receipt.vat_amount else None,
        "vat_rate": float(receipt.vat_rate) if receipt.vat_rate else None,
        "receipt_date": receipt.receipt_date.isoformat() if receipt.receipt_date else None,
        "comment": receipt.comment,
    }


@app.delete("/api/receipts/{receipt_id}", status_code=200)
def soft_delete_receipt(receipt_id: int, db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """Flagga ett kvitto som borttaget (soft delete – raderas ej från databasen)."""
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Kvittot hittades inte.")
    if receipt.is_deleted:
        raise HTTPException(status_code=400, detail="Kvittot är redan borttaget.")
    receipt.is_deleted = True
    db.commit()
    return {"id": receipt_id, "deleted": True}


@app.get("/api/receipts/deleted")
def list_deleted_receipts(db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """Hämta alla soft-deletade kvitton."""
    rows = db.query(Receipt).filter(Receipt.is_deleted == True).order_by(Receipt.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "user_name": _normalize_name(r.user_name),
            "store_name": r.store_name,
            "amount_gross": float(r.amount_gross) if r.amount_gross else None,
            "amount_net": float(r.amount_net) if r.amount_net else None,
            "vat_amount": float(r.vat_amount) if r.vat_amount else None,
            "vat_rate": float(r.vat_rate) if r.vat_rate else None,
            "receipt_date": r.receipt_date.isoformat() if r.receipt_date else None,
            "comment": r.comment,
            "image_filename": r.image_filename,
            "has_image": r.image_data is not None,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@app.post("/api/receipts/{receipt_id}/restore", status_code=200)
def restore_receipt(receipt_id: int, db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """Återskapa ett soft-deletat kvitto."""
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Kvittot hittades inte.")
    if not receipt.is_deleted:
        raise HTTPException(status_code=400, detail="Kvittot är inte borttaget.")
    receipt.is_deleted = False
    db.commit()
    return {"id": receipt_id, "restored": True}



@app.get("/api/receipts/{receipt_id}/image")
def get_receipt_image(receipt_id: int, db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """Hämta bilddata för ett specifikt kvitto."""
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id).first()
    if not receipt or not receipt.image_data:
        raise HTTPException(status_code=404, detail="Bild hittades inte.")
    return Response(content=receipt.image_data, media_type="image/jpeg")


class DuplicateCheckSingle(BaseModel):
    receipt_date:  Optional[str]   = None
    amount_gross:  Optional[float] = None
    store_name:    Optional[str]   = None

@app.post("/api/receipts/check-duplicate-single")
def check_duplicate_single(data: DuplicateCheckSingle, db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """Kontrollera om ett enskilt kvitto (från OCR-flödet) verkar vara en dubblett."""
    if data.amount_gross is None:
        return {"is_duplicate": False, "duplicate_id": None}

    receipt_date = None
    if data.receipt_date:
        try:
            receipt_date = date.fromisoformat(data.receipt_date)
        except ValueError:
            pass

    query = db.query(Receipt).filter(
        Receipt.is_deleted == False,
        Receipt.amount_gross.between(
            Decimal(str(data.amount_gross - 0.01)),
            Decimal(str(data.amount_gross + 0.01)),
        ),
    )
    if receipt_date:
        query = query.filter(Receipt.receipt_date == receipt_date)
    if data.store_name:
        query = query.filter(func.lower(Receipt.store_name) == data.store_name.strip().lower())

    match = query.first()
    return {
        "is_duplicate": match is not None,
        "duplicate_id": match.id if match else None,
        "duplicate_date": match.receipt_date.isoformat() if match and match.receipt_date else None,
        "duplicate_store": match.store_name if match else None,
        "duplicate_amount": float(match.amount_gross) if match and match.amount_gross else None,
    }


@app.get("/api/receipts/export")
def export_receipts_csv(
    date_from: Optional[str] = Query(None, alias="from"),
    date_to:   Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _: None = Depends(require_auth),
):
    """Exportera kvitton som CSV, valfritt filtrerat på datumspann."""
    query = db.query(Receipt).filter(Receipt.is_deleted == False)

    if date_from:
        try:
            query = query.filter(Receipt.receipt_date >= date.fromisoformat(date_from))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Ogiltigt from-datum: {date_from}")

    if date_to:
        try:
            query = query.filter(Receipt.receipt_date <= date.fromisoformat(date_to))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Ogiltigt to-datum: {date_to}")

    rows = query.order_by(Receipt.receipt_date.desc()).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["datum", "butik", "brutto", "netto", "moms", "moms_procent", "kommentar", "användare"])
    for r in rows:
        writer.writerow([
            r.receipt_date.isoformat() if r.receipt_date else "",
            r.store_name or "",
            float(r.amount_gross) if r.amount_gross is not None else "",
            float(r.amount_net)   if r.amount_net   is not None else "",
            float(r.vat_amount)   if r.vat_amount   is not None else "",
            float(r.vat_rate)     if r.vat_rate     is not None else "",
            r.comment or "",
            r.user_name or "",
        ])

    filename = "kvitton"
    if date_from or date_to:
        filename += f"_{date_from or ''}_{date_to or ''}"
    filename += ".csv"

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------------------------------------------------------------------- #
# CSV-hjälpfunktioner                                                          #
# --------------------------------------------------------------------------- #

def _normalize_name(name: Optional[str]) -> Optional[str]:
    """Normalisera ett personnamn: strip + title-case. 'robin' → 'Robin', 'ANNA' → 'Anna'."""
    if not name or not name.strip():
        return None
    return name.strip().title()

def _safe_float(val):
    """
    Parsar ett beloppsuttryck till float.
    Hanterar:
      - Valutasuffix och prefix: "kr", "SEK", ":-", "€", "$" m.m.
      - Svenska tusentalsavgränsare (mellanslag): "6 000,00"
      - Punkt som tusentalsavgränsare: "6.000,00"
      - Komma som decimaltecken: "6000,50"
    """
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    # Ta bort allt som inte är siffra, mellanslag, komma, punkt eller minus
    s = re.sub(r'[^\d\s.,\-]', '', s).strip()
    if not s:
        return None
    # Avgör decimal- vs tusentalsavgränsare
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            # "6.000,00" → punkt = tusental, komma = decimal
            s = s.replace('.', '').replace(',', '.')
        else:
            # "6,000.00" → komma = tusental, punkt = decimal
            s = s.replace(',', '')
    elif ',' in s:
        # Bara komma → decimal (svenska standard), ta bort mellanslag (tusental)
        s = s.replace(' ', '').replace(',', '.')
    else:
        # Bara punkt eller enbart siffror → ta bort mellanslag
        s = s.replace(' ', '')
    try:
        return float(s)
    except ValueError:
        return None

def _safe_date(val):
    if not val or not str(val).strip():
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(str(val).strip(), fmt).date()
        except ValueError:
            continue
    return None

def _parse_csv_file(contents: bytes, delimiter: str | None = None):
    """Läs CSV-bytes → lista av normaliserade rad-dict. Kastar ValueError vid fel."""
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = contents.decode("latin-1")

    if not delimiter:
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
            delimiter = dialect.delimiter
        except csv.Error:
            delimiter = ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if reader.fieldnames is None:
        raise ValueError("Filen verkar vara tom.")

    header = [h.lower().strip() for h in reader.fieldnames]
    for req in ["datum", "brutto"]:
        if req not in header:
            raise ValueError(f'Kolumnen "{req}" saknas i CSV-filen.')

    rows = []
    for row in reader:
        r = {k.lower().strip(): v for k, v in row.items()}
        rows.append({
            "datum":        r.get("datum", "").strip(),
            "butik":        r.get("butik", "").strip() or None,
            "brutto":       r.get("brutto", "").strip(),
            "netto":        r.get("netto", "").strip() or None,
            "moms":         r.get("moms", "").strip() or None,
            "moms_procent": r.get("moms_procent", "").strip() or None,
            "kommentar":    r.get("kommentar", "").strip() or None,
            "användare":    _normalize_name(r.get("användare", "") or r.get("anvandare", "") or None),
        })
    return rows

def _is_duplicate(row: dict, db: Session) -> Optional[int]:
    """
    Returnerar ID på matchande kvitto om dubbletten hittas, annars None.
    Matchar på: receipt_date + amount_gross (±0.01) + store_name (skift-okänsligt).
    """
    receipt_date = _safe_date(row.get("datum"))
    amount_gross = _safe_float(row.get("brutto"))
    store_name   = (row.get("butik") or "").strip().lower() or None

    if receipt_date is None or amount_gross is None:
        return None   # kan inte avgöra

    query = db.query(Receipt).filter(
        Receipt.is_deleted == False,
        Receipt.receipt_date == receipt_date,
        Receipt.amount_gross.between(
            Decimal(str(amount_gross - 0.01)),
            Decimal(str(amount_gross + 0.01)),
        ),
    )
    if store_name:
        query = query.filter(func.lower(Receipt.store_name) == store_name)

    match = query.first()
    return match.id if match else None


# --------------------------------------------------------------------------- #
# CSV endpoints                                                                #
# --------------------------------------------------------------------------- #

@app.post("/api/receipts/check-duplicates")
async def check_duplicates(
    file: UploadFile = File(...),
    delimiter: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_auth),
):
    """
    Ta emot en CSV-fil, parsa den och returnera varje rad med flaggan
    is_duplicate + duplicate_id om en matchande post redan finns.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Filen måste vara en .csv-fil.")

    # Normalisera delimiter-värdet
    delim = delimiter.strip() if delimiter and delimiter.strip() not in ("", "auto") else None
    if delim == "\\t":
        delim = "\t"

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Filen är för stor (max {MAX_UPLOAD_MB} MB).")
    try:
        rows = _parse_csv_file(contents, delimiter=delim)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = []
    for i, row in enumerate(rows):
        dup_id = _is_duplicate(row, db)
        result.append({
            **row,
            "is_duplicate":  dup_id is not None,
            "duplicate_id":  dup_id,
            "_row_index":    i,
        })

    return {"rows": result}


class ImportRow(BaseModel):
    datum:        Optional[str] = None
    butik:        Optional[str] = None
    brutto:       Optional[str] = None
    netto:        Optional[str] = None
    moms:         Optional[str] = None
    moms_procent: Optional[str] = None
    kommentar:    Optional[str] = None
    användare:    Optional[str] = None

class ImportRequest(BaseModel):
    rows: list[ImportRow]

@app.post("/api/receipts/import")
def import_receipts(data: ImportRequest, db: Session = Depends(get_db), _: None = Depends(require_auth)):
    """
    Importera en lista med rader (JSON). Klienten ansvarar för att
    filtrera bort de rader som inte ska importeras (t.ex. dubbletter).
    """
    imported = 0
    errors   = []

    for i, row in enumerate(data.rows, start=1):
        amount_gross = _safe_float(row.brutto)
        if amount_gross is None:
            errors.append({"rad": i, "fel": "Ogiltigt eller saknat brutto-belopp"})
            continue

        receipt = Receipt(
            receipt_date  = _safe_date(row.datum),
            store_name    = row.butik or None,
            amount_gross  = to_decimal(amount_gross),
            amount_net    = to_decimal(_safe_float(row.netto)),
            vat_amount    = to_decimal(_safe_float(row.moms)),
            vat_rate      = to_decimal(_safe_float(row.moms_procent)),
            comment       = row.kommentar or None,
            user_name     = _normalize_name(getattr(row, 'användare', None)),
        )
        db.add(receipt)
        imported += 1

    db.commit()
    return {"imported": imported, "errors": errors, "total_rows": imported + len(errors)}


@app.get("/health")
def health():
    return {"status": "ok", "ocr_engine": "claude-haiku-4-5"}
