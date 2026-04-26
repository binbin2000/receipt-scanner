# 🧾 ReceiptScanner

En webbapp för att registrera kvitton med AI-driven OCR, granska/justera de inlästa värdena och spara dem i en PostgreSQL-databas.

## Teknikstack

| Komponent  | Teknologi |
|------------|-----------|
| Frontend   | React 18 + Vite |
| Backend    | FastAPI (Python) |
| OCR        | Claude Haiku (Anthropic) |
| Databas    | PostgreSQL 16 |
| Deployment | Docker Compose + ghcr.io |

## Kom igång

### Krav
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installerat och igång
- Ett Anthropic API-konto med en giltig API-nyckel

### Konfiguration

Kopiera `.env.example` till `.env` och fyll i dina värden:

```bash
cp .env.example .env
```

Obligatoriska variabler:

| Variabel          | Beskrivning |
|-------------------|-------------|
| `GHCR_IMAGE`      | Bas-URL till dina Docker-images, t.ex. `ghcr.io/johndoe/receipt-scanner` |
| `ANTHROPIC_API_KEY` | Din Anthropic API-nyckel |
| `POSTGRES_PASSWORD` | Lösenord till databasen |

### Starta appen

```bash
docker compose up -d
```

Docker hämtar färdigbyggda images från ghcr.io — ingen lokal build krävs. Appen är sedan tillgänglig på:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **API-dokumentation:** http://localhost:8000/docs

### Stoppa appen

```bash
docker compose down
```

För att även ta bort databasen (all data raderas):

```bash
docker compose down -v
```

## Hur det fungerar

1. **Registrera** – Ladda upp en bild på ett kvitto, registrera manuellt, eller importera från CSV
2. **OCR** – Claude Haiku analyserar bilden och extraherar butik, belopp, datum och kategori
3. **Granska** – Justera värdena om något blivit fel, dubbletter markeras automatiskt
4. **Spara** – Data och bild sparas i PostgreSQL
5. **Exportera** – Ladda ner kvitton för valfritt datumintervall som CSV

## Projektstruktur

```
ReceiptScanner/
├── .env.example
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py          ← FastAPI-app, OCR-logik, CSV-import/export
│   └── database.py      ← SQLAlchemy-modeller
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        └── components/
            ├── ReceiptUploader.jsx   ← OCR, manuell registrering, CSV-import
            ├── ReceiptForm.jsx       ← Granska/justera + spara
            └── ReceiptList.jsx       ← Historik + export
```

## API-endpoints

| Metod  | Endpoint                            | Beskrivning |
|--------|-------------------------------------|-------------|
| POST   | `/api/ocr`                          | Ladda upp bild → kör OCR → returnera extraherade värden |
| POST   | `/api/receipts`                     | Spara kvitto till databasen |
| GET    | `/api/receipts`                     | Lista alla sparade kvitton |
| PATCH  | `/api/receipts/{id}`                | Uppdatera ett kvitto |
| DELETE | `/api/receipts/{id}`                | Ta bort ett kvitto (soft delete) |
| GET    | `/api/receipts/{id}/image`          | Hämta kvittobilden |
| GET    | `/api/receipts/export`              | Exportera kvitton som CSV (valfritt datumintervall) |
| POST   | `/api/receipts/check-duplicate-single` | Kontrollera om ett enskilt kvitto är en dubblett |
| POST   | `/api/receipts/check-duplicates`    | Kontrollera en batch av kvitton (CSV-import) |
| POST   | `/api/receipts/import`              | Importera kvitton från CSV |

## Autentisering (valfritt)

Appen stöder Authelia ForwardAuth via reverse proxy. Sätt `ENABLE_AUTH=true` i `.env` och konfigurera din proxy att skicka `Remote-User` och `Remote-Name`-headers. Användarnamnet registreras då automatiskt på varje kvitto.

## Tips för bättre OCR-träffsäkerhet

- Använd välupplysta foton utan skuggor
- Se till att texten är i fokus
- Håll kvittot rakt (inte vinklat)
- PNG ger generellt bättre resultat än JPEG för text
