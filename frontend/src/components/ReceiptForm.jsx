import { useState, useEffect } from 'react'

const C = {
  surface: '#1a1d27', surfaceDeep: '#13151f', border: '#2d3148',
  accent: '#3b82f6', accentHover: '#2563eb',
  green: '#34d399', greenBg: 'rgba(52,211,153,0.1)',
  red: '#f87171', redBg: 'rgba(248,113,113,0.1)',
  yellow: '#fbbf24',
  text: '#e2e8f0', textMuted: '#8892a4', textDim: '#4a5568',
  success: '#34d399', successBg: 'rgba(52,211,153,0.1)',
}

// ─── Bas-stilar för inputs – utanför komponenten för stabilitet ───────────────
const inputBase = {
  background: '#13151f',
  border: '1px solid #2d3148',
  borderRadius: 8,
  padding: '11px 12px',
  fontSize: 16,          // iOS: förhindrar auto-zoom vid fokus
  color: '#e2e8f0',
  outline: 'none',
  width: '100%',
  height: 44,            // konsekvent höjd på alla inputs
  boxSizing: 'border-box',
  WebkitAppearance: 'none',  // tar bort iOS-styling på date-input
  appearance: 'none',
}

const s = {
  card: { background: C.surface, borderRadius: 16, padding: 28, border: `1px solid ${C.border}` },
  title: { fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 22 },
  preview: {
    width: '100%', maxHeight: 200, objectFit: 'contain',
    borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 22,
  },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12,
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 12, fontWeight: 600, color: C.textMuted,
    display: 'flex', alignItems: 'center', gap: 6,
  },
  dot: (found) => ({
    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
    background: found ? C.green : C.textDim,
  }),
  textarea: {
    background: '#13151f',
    border: '1px solid #2d3148',
    borderRadius: 8,
    padding: '11px 12px',
    fontSize: 16,
    color: '#e2e8f0',
    outline: 'none',
    resize: 'vertical',
    minHeight: 72,
    width: '100%',
    boxSizing: 'border-box',
  },
  divider: { height: 1, background: C.border, margin: '20px 0' },
  claudeBox: {
    background: C.surfaceDeep, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: '14px 16px', marginBottom: 20,
  },
  claudeRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  claudeTitle: { fontSize: 12, fontWeight: 700, color: C.textMuted, flex: 1 },
  confidenceBadge: (level) => ({
    padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
    background: level === 'high' ? C.greenBg : C.redBg,
    color: level === 'high' ? C.green : C.red,
  }),
  claudeNotes: { fontSize: 12, color: C.textMuted, fontStyle: 'italic', lineHeight: 1.5 },
  claudeJson: {
    fontSize: 11, color: C.textDim, fontFamily: 'monospace',
    marginTop: 8, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    maxHeight: 100, overflowY: 'auto',
  },
  toggleBtn: {
    background: 'none', border: 'none', color: C.textMuted,
    fontSize: 12, cursor: 'pointer', padding: 0,
  },
  btnRow: { display: 'flex', gap: 10, marginTop: 6 },
  btnPrimary: {
    flex: 1, padding: '13px 0',
    background: C.accent, color: '#fff',
    border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  btnSecondary: {
    padding: '13px 18px',
    background: C.surfaceDeep, color: C.textMuted,
    border: `1px solid ${C.border}`, borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  success: {
    background: C.successBg, color: C.success,
    borderRadius: 8, padding: '12px 16px',
    marginTop: 16, fontSize: 14, fontWeight: 600, textAlign: 'center',
  },
  error: {
    background: C.redBg, color: C.red,
    borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 14,
  },
}

// ─── Field utanför komponenten → förhindrar omounting vid re-render (tangentbord) ─
function Field({ label, found, children }) {
  return (
    <div style={s.field}>
      <label style={s.label}>
        <span style={s.dot(found)} />
        {label}
      </label>
      {children}
    </div>
  )
}

const getSaved = (key, fallback = '') => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK', 'CHF', 'JPY', 'PLN', 'CZK', 'HUF', 'CAD', 'AUD']

export default function ReceiptForm({ ocrResult, onSaved, onBack, authName = null }) {
  const [userName,       setUserName]       = useState(authName ?? getSaved('receipt_user_name'))
  const [comment,        setComment]        = useState(ocrResult?.item_summary ?? '')
  const [storeName,      setStoreName]      = useState(ocrResult?.store_name ?? '')
  const [amountGross,    setAmountGross]    = useState(ocrResult?.amount_gross?.toFixed(2) ?? '')
  const [amountNet,      setAmountNet]      = useState(ocrResult?.amount_net?.toFixed(2) ?? '')
  const [vatAmount,      setVatAmount]      = useState(ocrResult?.vat_amount?.toFixed(2) ?? '')
  const [vatRate,        setVatRate]        = useState(ocrResult?.vat_rate ?? 25)
  const [receiptDate,    setReceiptDate]    = useState(ocrResult?.date ?? '')
  const [currency,       setCurrency]       = useState(ocrResult?.currency ?? 'SEK')
  const [foreignAmount,  setForeignAmount]  = useState(ocrResult?.foreign_amount?.toFixed(2) ?? '')
  const [exchangeRate,   setExchangeRate]   = useState('1.0')
  const [rateCache,      setRateCache]      = useState({})
  const [showRaw,        setShowRaw]        = useState(false)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState(null)
  const [success,        setSuccess]        = useState(false)
  const [dupInfo,        setDupInfo]        = useState(null)   // null | { is_duplicate, duplicate_id, duplicate_date, duplicate_store, duplicate_amount }

  // Hämta valutakurscachen vid mount
  useEffect(() => {
    fetch('/api/exchange-rates').then(r => r.ok ? r.json() : {}).then(data => {
      setRateCache(data)
      const cur = ocrResult?.currency ?? 'SEK'
      if (cur !== 'SEK' && data[cur]) setExchangeRate(String(data[cur]))
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const calcFromGross = (gross, rate, setNet, setVat) => {
    const g = parseFloat(String(gross).replace(',', '.'))
    const r = parseFloat(String(rate).replace(',', '.'))
    if (!isNaN(g) && !isNaN(r) && r >= 0) {
      const net = g / (1 + r / 100)
      setNet(net.toFixed(2))
      setVat((g - net).toFixed(2))
    }
  }

  const handleGrossChange = (val) => {
    setAmountGross(val)
    calcFromGross(val, vatRate, setAmountNet, setVatAmount)
  }

  const handleNetChange = (val) => {
    setAmountNet(val)
    const r = parseFloat(String(vatRate).replace(',', '.'))
    const net = parseFloat(String(val).replace(',', '.'))
    if (!isNaN(net) && !isNaN(r) && r >= 0) {
      const gross = net * (1 + r / 100)
      setAmountGross(gross.toFixed(2))
      setVatAmount((gross - net).toFixed(2))
    }
  }

  const handleVatRateChange = (val) => {
    setVatRate(val)
    const r = parseFloat(String(val).replace(',', '.'))
    if (!isNaN(r) && r >= 0) {
      const gross = parseFloat(String(amountGross).replace(',', '.'))
      const net = parseFloat(String(amountNet).replace(',', '.'))
      if (!isNaN(gross)) {
        calcFromGross(amountGross, val, setAmountNet, setVatAmount)
      } else if (!isNaN(net)) {
        const newGross = net * (1 + r / 100)
        setAmountGross(newGross.toFixed(2))
        setVatAmount((newGross - net).toFixed(2))
      }
    }
  }

  const handleCurrencyChange = (val) => {
    setCurrency(val)
    if (val === 'SEK') {
      setExchangeRate('1.0')
      setForeignAmount('')
    } else if (rateCache[val]) {
      setExchangeRate(String(rateCache[val]))
    }
  }

  const handleForeignAmountChange = (val) => {
    setForeignAmount(val)
    const fa = parseFloat(String(val).replace(',', '.'))
    const er = parseFloat(String(exchangeRate).replace(',', '.'))
    if (!isNaN(fa) && !isNaN(er) && er > 0) {
      const gross = (fa * er).toFixed(2)
      setAmountGross(gross)
      calcFromGross(gross, vatRate, setAmountNet, setVatAmount)
    }
  }

  const handleExchangeRateChange = (val) => {
    setExchangeRate(val)
    const fa = parseFloat(String(foreignAmount).replace(',', '.'))
    const er = parseFloat(String(val).replace(',', '.'))
    if (!isNaN(fa) && !isNaN(er) && er > 0) {
      const gross = (fa * er).toFixed(2)
      setAmountGross(gross)
      calcFromGross(gross, vatRate, setAmountNet, setVatAmount)
    }
  }

  // Auto-beräkna netto vid start om bara brutto finns från OCR
  useEffect(() => {
    if (ocrResult?.amount_gross && !ocrResult?.amount_net) {
      calcFromGross(ocrResult.amount_gross, ocrResult?.vat_rate ?? 25, setAmountNet, setVatAmount)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Kör dublettkontroll när OCR-data laddas in
  useEffect(() => {
    if (!ocrResult) return
    const gross = ocrResult.amount_gross
    if (gross == null) return   // kan inte avgöra utan belopp

    fetch('/api/receipts/check-duplicate-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receipt_date:  ocrResult.date   || null,
        amount_gross:  gross,
        store_name:    ocrResult.store_name || null,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.is_duplicate) setDupInfo(data) })
      .catch(() => {})
  }, [ocrResult])

  if (!ocrResult) {
    return (
      <div style={s.card}>
        <p style={{ color: C.textMuted, textAlign: 'center', padding: '32px 0' }}>
          Inget skannat kvitto. Gå tillbaka och ladda upp en bild.
        </p>
        <button style={s.btnSecondary} onClick={onBack}>← Tillbaka</button>
      </div>
    )
  }

  const handleSubmit = async () => {
    const missing = []
    if (!storeName?.trim()) missing.push('Butik / företag')
    if (!receiptDate)       missing.push('Datum')
    if (!amountGross)       missing.push('Bruttobelopp')
    if (!amountNet)         missing.push('Nettobelopp')
    if (!vatAmount)         missing.push('Momsbelopp')
    if (vatRate === '' || vatRate == null) missing.push('Momssats')
    if (missing.length > 0) { setError(`Fyll i alla obligatoriska fält: ${missing.join(', ')}`); return }
    setLoading(true); setError(null)
    try {
      try { localStorage.setItem('receipt_user_name', userName) } catch {}
      const parse = (v) => v !== '' && v != null ? parseFloat(String(v).replace(',', '.')) : null
      const isForeign = currency !== 'SEK'
      const body = {
        user_name: userName || null,
        store_name: storeName || null,
        amount_gross: parse(amountGross),
        amount_net: parse(amountNet),
        vat_amount: parse(vatAmount),
        vat_rate: parse(vatRate),
        currency: currency || 'SEK',
        foreign_amount: isForeign ? parse(foreignAmount) : null,
        exchange_rate: isForeign ? parse(exchangeRate) : 1.0,
        raw_ocr_response: ocrResult.raw_ocr_response ?? null,
        receipt_date: receiptDate || null,
        comment: comment || null,
        image_base64: ocrResult.image_base64 ?? null,
        image_filename: ocrResult.filename ?? null,
        image_content_type: ocrResult.image_content_type ?? null,
      }
      const res = await fetch('/api/receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel vid sparande') }
      setSuccess(true)
      setTimeout(() => onSaved(), 1500)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.card}>
      <h2 style={s.title}>✏️ Granska och justera</h2>

      {ocrResult.image_base64 && (
        <img
          src={`data:${ocrResult.image_content_type};base64,${ocrResult.image_base64}`}
          alt="Kvitto" style={s.preview}
        />
      )}

      {/* Claude-info */}
      <div style={s.claudeBox}>
        <div style={s.claudeRow}>
          <span style={s.claudeTitle}>🤖 Claude AI-analys</span>
          {ocrResult.confidence && (
            <span style={s.confidenceBadge(ocrResult.confidence)}>
              {ocrResult.confidence === 'high' ? 'Hög säkerhet' : ocrResult.confidence === 'medium' ? 'Medel' : 'Låg säkerhet'}
            </span>
          )}
          <button style={s.toggleBtn} onClick={() => setShowRaw(v => !v)}>
            {showRaw ? '▲ Dölj' : '▼ Råsvar'}
          </button>
        </div>
        {ocrResult.item_summary && <p style={{ ...s.claudeNotes, marginBottom: ocrResult.notes ? 6 : 0 }}>🛒 {ocrResult.item_summary}</p>}
        {ocrResult.notes && <p style={s.claudeNotes}>💬 {ocrResult.notes}</p>}
        {ocrResult.image_orig_kb > 0 && (
          <p style={{ ...s.claudeNotes, marginTop: 6, color: '#4a5568' }}>
            🗜 Bild komprimerad: {ocrResult.image_orig_kb} KB → {ocrResult.image_comp_kb} KB
          </p>
        )}
        {showRaw && ocrResult.raw_ocr_response && (
          <div style={s.claudeJson}>{ocrResult.raw_ocr_response}</div>
        )}
      </div>

      {/* Dubblettvarning */}
      {dupInfo?.is_duplicate && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fcd34d', marginBottom: 4 }}>
              Möjlig dubblett
            </div>
            <div style={{ fontSize: 12, color: '#d97706', lineHeight: 1.6 }}>
              Ett liknande kvitto finns redan sparat
              {dupInfo.duplicate_store ? ` från ${dupInfo.duplicate_store}` : ''}
              {dupInfo.duplicate_date  ? ` (${dupInfo.duplicate_date})` : ''}
              {dupInfo.duplicate_amount != null ? ` på ${dupInfo.duplicate_amount.toFixed(2)} kr` : ''}.{' '}
              Du kan ändå spara om det är ett nytt kvitto.
            </div>
          </div>
        </div>
      )}

      {/* Inlämnad av + kommentar */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Inlämnad av</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={authName ? 'Namn (förifyllt från inloggning)' : 'Ditt namn'} found={!!userName}>
            <input
              style={inputBase}
              type="text"
              placeholder="Fyll i ditt namn..."
              value={userName}
              onChange={e => setUserName(e.target.value)}
            />
          </Field>
          <Field label="Kommentar (valfritt)" found={false}>
            <textarea
              style={s.textarea}
              placeholder="t.ex. Lunch med kund, projektnamn, kontostring..."
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div style={s.divider} />

      {/* Kvittoinformation */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Kvittoinformation</div>
        <div style={{ ...s.grid2, marginBottom: 14 }}>
          <Field label="Butik / företag" found={!!ocrResult.store_name}>
            <input
              style={inputBase}
              type="text"
              placeholder="ICA, Systembolaget..."
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
            />
          </Field>
          <Field label="Datum" found={!!ocrResult.date}>
            <input
              style={inputBase}
              type="date"
              value={receiptDate}
              onChange={e => setReceiptDate(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div style={s.divider} />

      {/* Belopp & moms */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Belopp & moms</div>

        {/* Valuta */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14, marginBottom: 14, alignItems: 'end' }}>
          <Field label="Valuta" found={!!ocrResult.currency}>
            <select style={{ ...inputBase, cursor: 'pointer' }} value={currency} onChange={e => handleCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {currency !== 'SEK' && (
            <Field label={`Belopp i ${currency} (originalvaluta)`} found={!!ocrResult.foreign_amount}>
              <input style={inputBase} type="number" step="0.01" placeholder="0.00"
                value={foreignAmount} onChange={e => handleForeignAmountChange(e.target.value)} />
            </Field>
          )}
        </div>
        {currency !== 'SEK' && (
          <div style={{ marginBottom: 14, maxWidth: 260 }}>
            <Field label={`Valutakurs (SEK per 1 ${currency})`} found={false}>
              <input style={inputBase} type="number" step="0.0001" placeholder="11.50"
                value={exchangeRate} onChange={e => handleExchangeRateChange(e.target.value)} />
            </Field>
          </div>
        )}

        <div style={{ marginBottom: 14, maxWidth: 180 }}>
          <Field label="Momssats (%)" found={!!ocrResult.vat_rate}>
            <input style={inputBase} type="number" step="1" placeholder="25"
              value={vatRate} onChange={e => handleVatRateChange(e.target.value)} />
          </Field>
        </div>
        <div style={s.grid3}>
          <Field label="Brutto inkl. moms (SEK)" found={!!ocrResult.amount_gross}>
            <input style={inputBase} type="number" step="0.01" placeholder="249.90"
              value={amountGross} onChange={e => handleGrossChange(e.target.value)} />
          </Field>
          <Field label="Netto exkl. moms (SEK)" found={!!ocrResult.amount_net}>
            <input style={inputBase} type="number" step="0.01" placeholder="199.92"
              value={amountNet} onChange={e => handleNetChange(e.target.value)} />
          </Field>
          <Field label="Momsbelopp (SEK)" found={!!ocrResult.vat_amount}>
            <input style={inputBase} type="number" step="0.01" placeholder="49.98"
              value={vatAmount} onChange={e => setVatAmount(e.target.value)} />
          </Field>
        </div>
      </div>

      <div style={s.btnRow}>
        <button style={s.btnSecondary} onClick={onBack} disabled={loading}>← Tillbaka</button>
        <button style={s.btnPrimary} onClick={handleSubmit} disabled={loading || success}>
          {loading ? '⏳ Sparar...' : '💾 Spara kvitto'}
        </button>
      </div>
      {success && <div style={s.success}>✅ Kvittot sparades!</div>}
      {error && <div style={s.error}>⚠️ {error}</div>}
    </div>
  )
}
