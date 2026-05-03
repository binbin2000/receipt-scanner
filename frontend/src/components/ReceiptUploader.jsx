import { useState, useRef, useEffect } from 'react'

const C = {
  surface: '#1a1d27', surfaceDeep: '#13151f', border: '#2d3148', accent: '#3b82f6',
  text: '#e2e8f0', textMuted: '#8892a4', textDim: '#4a5568',
  error: '#f87171', errorBg: 'rgba(248,113,113,0.1)',
  green: '#34d399', greenBg: 'rgba(52,211,153,0.1)',
  overlay: 'rgba(0,0,0,0.72)',
}

const s = {
  card: {
    background: C.surface,
    borderRadius: 16,
    padding: 28,
    border: `1px solid ${C.border}`,
  },
  dropzone: (dragging) => ({
    border: `2px dashed ${dragging ? C.accent : C.border}`,
    borderRadius: 12,
    padding: '44px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: dragging ? 'rgba(108,99,255,0.08)' : 'rgba(255,255,255,0.02)',
    marginBottom: 16,
  }),
  icon: { fontSize: 44, marginBottom: 12 },
  dropText: { color: C.text, fontSize: 15, lineHeight: 1.6 },
  hint: { color: C.textMuted, fontSize: 13, marginTop: 6 },
  preview: {
    width: '100%', maxHeight: 280, objectFit: 'contain',
    borderRadius: 10, marginBottom: 0, border: `1px solid ${C.border}`,
  },
  filename: { fontSize: 13, color: C.textMuted, marginBottom: 14, marginTop: 10 },
  btn: (disabled) => ({
    width: '100%', padding: '13px 0',
    background: disabled ? '#2a2d3e' : C.accent,
    color: disabled ? C.textMuted : '#fff',
    border: 'none', borderRadius: 10,
    fontSize: 15, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s',
  }),
  error: {
    background: C.errorBg, color: C.error,
    borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 14,
  },
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* CSV-importmodal                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */
function CsvImportModal({ onClose, onImported }) {
  const csvRef = useRef()

  // Steg: 'pick' → 'checking' → 'review' → 'importing' → 'done'
  const [step,      setStep]     = useState('pick')
  const [csvFile,   setCsvFile]  = useState(null)
  const [delimiter, setDelimiter] = useState('auto')
  const [rows,      setRows]     = useState([])    // [{...rowData, is_duplicate, duplicate_id, _row_index}]
  const [checked,   setChecked]  = useState({})    // { _row_index: bool }
  const [error,     setError]    = useState(null)
  const [result,    setResult]   = useState(null)  // { imported, errors }

  /* Stäng på Escape */
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const handleCsvFile = async (f) => {
    if (!f) return
    if (!f.name.endsWith('.csv')) { setError('Välj en .csv-fil.'); return }
    setCsvFile(f)
    setError(null)
    setStep('checking')

    try {
      const form = new FormData()
      form.append('file', f)
      form.append('delimiter', delimiter)
      const res = await fetch('/api/receipts/check-duplicates', { method: 'POST', body: form })
      if (!res.ok) {
        let msg = 'Kunde inte analysera filen'
        try { const e = await res.json(); msg = e.detail || msg } catch {}
        throw new Error(msg)
      }
      const data = await res.json()
      const checkedInit = {}
      data.rows.forEach(r => {
        // Markera som vald om INTE dubblett
        checkedInit[r._row_index] = !r.is_duplicate
      })
      setRows(data.rows)
      setChecked(checkedInit)
      setStep('review')
    } catch (e) {
      setError(e.message)
      setStep('pick')
    }
  }

  const toggleRow = (idx) => setChecked(prev => ({ ...prev, [idx]: !prev[idx] }))

  const toggleAll = () => {
    const allOn = rows.every(r => checked[r._row_index])
    const next = {}
    rows.forEach(r => { next[r._row_index] = !allOn })
    setChecked(next)
  }

  const selectedRows = rows.filter(r => checked[r._row_index])
  const dupCount     = rows.filter(r => r.is_duplicate).length

  const handleImport = async () => {
    if (selectedRows.length === 0) return
    setStep('importing')
    try {
      const res = await fetch('/api/receipts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: selectedRows }),
      })
      if (!res.ok) {
        let msg = 'Import misslyckades'
        try { const e = await res.json(); msg = e.detail || msg } catch {}
        throw new Error(msg)
      }
      const data = await res.json()
      setResult(data)
      setStep('done')
      if (onImported) onImported()
    } catch (e) {
      setError(e.message)
      setStep('review')
    }
  }

  const PREVIEW_COLS = ['datum', 'butik', 'brutto', 'kommentar', 'användare']

  const m = {
    overlay: {
      position: 'fixed', inset: 0, background: C.overlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    },
    box: {
      background: C.surface, borderRadius: 18, border: `1px solid ${C.border}`,
      width: '100%', maxWidth: 640, maxHeight: '88vh',
      display: 'flex', flexDirection: 'column',
    },
    header: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    },
    title:      { fontSize: 17, fontWeight: 700, color: C.text },
    closeBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 22, lineHeight: 1 },
    body:       { padding: '20px 24px', flex: 1, overflowY: 'auto' },
    footer:     { padding: '14px 24px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, flexShrink: 0 },
    hint:       { fontSize: 12, color: C.textMuted, marginBottom: 16, lineHeight: 1.7 },
    dropzone:   { border: `2px dashed ${C.border}`, borderRadius: 10, padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: 16, background: 'rgba(255,255,255,0.02)' },
    sectionLbl: { fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, display: 'block' },
    table:      { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    th:         { padding: '6px 8px', background: C.surfaceDeep, color: C.textMuted, fontWeight: 600, textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
    td:         { padding: '5px 8px', color: C.text, borderBottom: `1px solid rgba(45,49,72,0.5)`, verticalAlign: 'middle' },
    dupBadge:   { display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' },
    warnBox:    { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fcd34d', marginBottom: 14 },
    success:    { background: C.greenBg, color: C.green, borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 12 },
    errBox:     { background: C.errorBg, color: C.error, borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 12 },
    btnPrimary: { flex: 1, padding: '11px 0', background: C.accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
    btnSecondary:{ padding: '11px 16px', background: C.surfaceDeep, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  }

  return (
    <div style={m.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={m.box}>

        <div style={m.header}>
          <span style={m.title}>📂 Importera kvitton från CSV</span>
          <button style={m.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={m.body}>

          {/* ── STEG 1: Välj fil ── */}
          {(step === 'pick' || step === 'checking') && (
            <>
              {/* Kolumnformat-tabell */}
              <table style={{ ...m.table, marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th style={m.th}>Kolumn</th>
                    <th style={m.th}>Krav</th>
                    <th style={m.th}>Format / exempel</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['datum',        '✱ Obligatorisk', 'ÅÅÅÅ-MM-DD  →  2024-03-15'],
                    ['brutto',       '✱ Obligatorisk', 'Belopp inkl. moms  →  6 000,00 kr  eller  249.90'],
                    ['butik',        'Valfri',          'Butiksnamn som fritext  →  ICA Maxi'],
                    ['netto',        'Valfri',          'Belopp exkl. moms, samma format som brutto'],
                    ['moms',         'Valfri',          'Momsbelopp, samma format som brutto'],
                    ['moms_procent', 'Valfri',          'Momssats i procent  →  25'],
                    ['kommentar',    'Valfri',          'Fritext'],
                    ['användare',    'Valfri',          'Personnamn  →  Anna'],
                  ].map(([col, req, fmt]) => (
                    <tr key={col}>
                      <td style={m.td}><code style={{ color: C.accent, fontSize: 11 }}>{col}</code></td>
                      <td style={{ ...m.td, whiteSpace: 'nowrap', color: req.startsWith('✱') ? '#fcd34d' : C.textMuted, fontSize: 11 }}>{req}</td>
                      <td style={{ ...m.td, color: C.textMuted, fontSize: 11 }}>{fmt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ ...m.hint, marginBottom: 12 }}>
                Belopp accepteras med komma <em>eller</em> punkt som decimaltecken och mellanslag eller punkt som tusentalsavgränsare.
                Valutasuffix som <code>kr</code> ignoreras automatiskt.
              </p>

              {/* Delimiter-väljare */}
              <div style={{ marginBottom: 16 }}>
                <span style={m.sectionLbl}>Separator</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { value: 'auto', label: 'Auto' },
                    { value: ',',    label: 'Komma  ,' },
                    { value: ';',    label: 'Semikolon  ;' },
                    { value: '\\t',  label: 'Tab' },
                    { value: '|',    label: 'Pipe  |' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDelimiter(opt.value)}
                      style={{
                        padding: '5px 12px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${delimiter === opt.value ? C.accent : C.border}`,
                        background: delimiter === opt.value ? 'rgba(59,130,246,0.15)' : C.surfaceDeep,
                        color: delimiter === opt.value ? C.accent : C.textMuted,
                        fontWeight: delimiter === opt.value ? 700 : 400,
                        transition: 'all 0.15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={m.dropzone} onClick={() => step === 'pick' && csvRef.current.click()}>
                {step === 'checking'
                  ? <span style={{ color: C.textMuted }}>⏳ Analyserar dubbletter…</span>
                  : csvFile
                    ? <span style={{ color: C.text }}>📎 {csvFile.name}</span>
                    : <span style={{ color: C.textMuted }}>Klicka för att välja .csv-fil</span>
                }
              </div>
              <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => handleCsvFile(e.target.files[0])} />
              {error && <div style={m.errBox}>⚠️ {error}</div>}
            </>
          )}

          {/* ── STEG 2: Granska med kryssrutor ── */}
          {step === 'review' && (
            <>
              {dupCount > 0 && (
                <div style={m.warnBox}>
                  ⚠️ <strong>{dupCount} möjlig{dupCount !== 1 ? 'a dubbletter' : ' dubblett'}</strong> hittades och har avmarkerats.
                  Du kan markera dem manuellt om du ändå vill importera.
                </div>
              )}

              <span style={m.sectionLbl}>
                {rows.length} rader · {selectedRows.length} valda för import
              </span>

              <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8 }}>
                <table style={m.table}>
                  <thead>
                    <tr>
                      <th style={{ ...m.th, width: 32, textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={rows.length > 0 && rows.every(r => checked[r._row_index])}
                          onChange={toggleAll}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ ...m.th, width: 60 }}>Status</th>
                      {PREVIEW_COLS.map(h => <th key={h} style={m.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const isChecked = !!checked[row._row_index]
                      const rowStyle = {
                        ...m.td,
                        opacity: isChecked ? 1 : 0.45,
                        background: row.is_duplicate ? 'rgba(245,158,11,0.04)' : 'transparent',
                      }
                      return (
                        <tr key={row._row_index} onClick={() => toggleRow(row._row_index)} style={{ cursor: 'pointer' }}>
                          <td style={{ ...rowStyle, textAlign: 'center' }}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleRow(row._row_index)}
                              onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={rowStyle}>
                            {row.is_duplicate
                              ? <span style={m.dupBadge}>Dubblett</span>
                              : <span style={{ fontSize: 11, color: C.green }}>✓ OK</span>
                            }
                          </td>
                          {PREVIEW_COLS.map(h => (
                            <td key={h} style={rowStyle}>{row[h] || '—'}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {error && <div style={{ ...m.errBox, marginTop: 8 }}>⚠️ {error}</div>}
            </>
          )}

          {/* ── STEG 3: Klar ── */}
          {step === 'done' && result && (
            <>
              <div style={m.success}>
                ✅ {result.imported} kvitto{result.imported !== 1 ? 'n' : ''} importerades!
              </div>
              {result.errors?.length > 0 && (
                <>
                  <div style={m.errBox}>⚠️ {result.errors.length} rad(er) hoppades över:</div>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, paddingLeft: 8 }}>
                      Rad {e.rad}: {e.fel}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

        </div>

        <div style={m.footer}>
          {step === 'done' ? (
            <button style={m.btnPrimary} onClick={onClose}>Stäng</button>
          ) : step === 'review' ? (
            <>
              <button style={m.btnSecondary} onClick={onClose}>Avbryt</button>
              <button
                style={{ ...m.btnPrimary, opacity: selectedRows.length === 0 ? 0.4 : 1 }}
                onClick={handleImport}
                disabled={selectedRows.length === 0}
              >
                ⬆️ Importera {selectedRows.length} kvitto{selectedRows.length !== 1 ? 'n' : ''}
              </button>
            </>
          ) : (
            <button style={m.btnSecondary} onClick={onClose}>Avbryt</button>
          )}
        </div>

      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Manuell registrering – hjälpkomponent utanför modal (iOS keyboard-fix)    */
/* ══════════════════════════════════════════════════════════════════════════ */
const mInputBase = {
  background: '#13151f', border: '1px solid #2d3148', borderRadius: 8,
  padding: '9px 11px', fontSize: 16, color: '#e2e8f0', outline: 'none',
  width: '100%', height: 44, boxSizing: 'border-box',
  WebkitAppearance: 'none', appearance: 'none',
}

function MField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK', 'CHF', 'JPY', 'PLN', 'CZK', 'HUF', 'CAD', 'AUD']

/* ══════════════════════════════════════════════════════════════════════════ */
/* Manuell registreringsmodal                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */
function ManualReceiptModal({ onClose, onSaved, authName = null }) {
  const imgRef = useRef()

  const [userName,      setUserName]      = useState(() => {
    if (authName) return authName
    try { return localStorage.getItem('receipt_user_name') ?? '' } catch { return '' }
  })
  const [storeName,     setStoreName]     = useState('')
  const [receiptDate,   setReceiptDate]   = useState('')
  const [amountGross,   setAmountGross]   = useState('')
  const [amountNet,     setAmountNet]     = useState('')
  const [vatAmount,     setVatAmount]     = useState('')
  const [vatRate,       setVatRate]       = useState(25)
  const [currency,      setCurrency]      = useState('SEK')
  const [foreignAmount, setForeignAmount] = useState('')
  const [exchangeRate,  setExchangeRate]  = useState('1.0')
  const [rateCache,     setRateCache]     = useState({})
  const [comment,       setComment]       = useState('')
  const [imgFile,       setImgFile]       = useState(null)
  const [imgPreview,    setImgPreview]    = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [success,       setSuccess]       = useState(false)

  // Hämta valutakurscachen vid mount
  useEffect(() => {
    fetch('/api/exchange-rates').then(r => r.ok ? r.json() : {}).then(data => {
      setRateCache(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const handleImgFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setImgFile(f)
    setImgPreview(URL.createObjectURL(f))
  }

  const parse = (v) => v !== '' && v != null ? parseFloat(String(v).replace(',', '.')) : null

  const calcFromGross = (gross, rate) => {
    const g = parseFloat(String(gross).replace(',', '.'))
    const r = parseFloat(String(rate).replace(',', '.'))
    if (!isNaN(g) && !isNaN(r) && r >= 0) {
      const net = g / (1 + r / 100)
      setAmountNet(net.toFixed(2))
      setVatAmount((g - net).toFixed(2))
    }
  }

  const handleGrossChange = (val) => {
    setAmountGross(val)
    calcFromGross(val, vatRate)
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
        calcFromGross(amountGross, val)
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
      calcFromGross(gross, vatRate)
    }
  }

  const handleExchangeRateChange = (val) => {
    setExchangeRate(val)
    const fa = parseFloat(String(foreignAmount).replace(',', '.'))
    const er = parseFloat(String(val).replace(',', '.'))
    if (!isNaN(fa) && !isNaN(er) && er > 0) {
      const gross = (fa * er).toFixed(2)
      setAmountGross(gross)
      calcFromGross(gross, vatRate)
    }
  }

  const toB64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const handleSave = async () => {
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

      let imageBase64 = null
      let imageFilename = null
      if (imgFile) {
        imageBase64   = await toB64(imgFile)
        imageFilename = imgFile.name
      }

      const isForeign = currency !== 'SEK'
      const body = {
        user_name:          userName || null,
        store_name:         storeName || null,
        amount_gross:       parse(amountGross),
        amount_net:         parse(amountNet),
        vat_amount:         parse(vatAmount),
        vat_rate:           parse(vatRate),
        currency:           currency || 'SEK',
        foreign_amount:     isForeign ? parse(foreignAmount) : null,
        exchange_rate:      isForeign ? parse(exchangeRate) : 1.0,
        receipt_date:       receiptDate || null,
        comment:            comment || null,
        image_base64:       imageBase64,
        image_filename:     imageFilename,
        image_content_type: imgFile?.type || null,
      }

      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel vid sparande') }
      setSuccess(true)
      setTimeout(() => { onClose(); onSaved() }, 1400)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const m = {
    overlay: { position: 'fixed', inset: 0, background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
    box: { background: C.surface, borderRadius: 18, border: `1px solid ${C.border}`, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 },
    title: { fontSize: 17, fontWeight: 700, color: C.text },
    closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 22, lineHeight: 1 },
    body: { padding: '20px 24px', flex: 1, overflowY: 'auto' },
    footer: { padding: '14px 24px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, flexShrink: 0 },
    sectionLbl: { fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, marginTop: 18, display: 'block' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 },
    imgZone: { border: `2px dashed ${C.border}`, borderRadius: 10, padding: '16px', textAlign: 'center', cursor: 'pointer', marginBottom: 18, background: 'rgba(255,255,255,0.02)' },
    imgPreview: { width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 8, border: `1px solid ${C.border}` },
    textarea: { background: '#13151f', border: '1px solid #2d3148', borderRadius: 8, padding: '9px 11px', fontSize: 16, color: C.text, outline: 'none', resize: 'vertical', minHeight: 68, width: '100%', boxSizing: 'border-box' },
    success: { background: C.greenBg, color: C.green, borderRadius: 8, padding: '12px 16px', fontSize: 14, fontWeight: 600, textAlign: 'center', marginBottom: 10 },
    errBox: { background: C.errorBg, color: C.error, borderRadius: 8, padding: '10px 14px', fontSize: 14, marginTop: 10 },
    btnPrimary: { flex: 1, padding: '12px 0', background: C.accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
    btnSecondary: { padding: '12px 16px', background: C.surfaceDeep, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  }

  return (
    <div style={m.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={m.box}>

        <div style={m.header}>
          <span style={m.title}>✏️ Registrera kvitto manuellt</span>
          <button style={m.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={m.body}>
          {success && <div style={m.success}>✅ Kvitto sparat!</div>}

          {/* Bild (valfri) */}
          <span style={{ ...m.sectionLbl, marginTop: 0 }}>Bild (valfri)</span>
          <div style={m.imgZone} onClick={() => imgRef.current.click()}>
            {imgPreview
              ? <img src={imgPreview} alt="Kvitto" style={m.imgPreview} />
              : <span style={{ color: C.textMuted, fontSize: 13 }}>📷 Klicka för att bifoga kvittobild</span>
            }
          </div>
          <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => handleImgFile(e.target.files[0])} />

          {/* Inlämnad av */}
          <span style={m.sectionLbl}>Inlämnad av</span>
          <div style={m.grid2}>
            <MField label={authName ? 'Namn (förifyllt från inloggning)' : 'Namn'}>
              <input style={mInputBase} type="text" value={userName}
                onChange={e => setUserName(e.target.value)} placeholder="Ditt namn" />
            </MField>
            <MField label="Butik / företag">
              <input style={mInputBase} type="text" value={storeName}
                onChange={e => setStoreName(e.target.value)} placeholder="ICA Maxi" />
            </MField>
          </div>
          <MField label="Kommentar">
            <textarea style={m.textarea} value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Vad köptes? Projektnamn, kontostring..." />
          </MField>

          {/* Datum */}
          <span style={m.sectionLbl}>Kvittodatum</span>
          <div style={{ maxWidth: 180, marginBottom: 14 }}>
            <MField label="Datum">
              <input style={mInputBase} type="date" value={receiptDate}
                onChange={e => setReceiptDate(e.target.value)} />
            </MField>
          </div>

          {/* Belopp */}
          <span style={m.sectionLbl}>Belopp & moms</span>

          {/* Valuta */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, marginBottom: 14, alignItems: 'end' }}>
            <MField label="Valuta">
              <select style={{ ...mInputBase, cursor: 'pointer' }} value={currency} onChange={e => handleCurrencyChange(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </MField>
            {currency !== 'SEK' && (
              <MField label={`Belopp i ${currency}`}>
                <input style={mInputBase} type="number" step="0.01" value={foreignAmount}
                  onChange={e => handleForeignAmountChange(e.target.value)} placeholder="0.00" />
              </MField>
            )}
          </div>
          {currency !== 'SEK' && (
            <div style={{ maxWidth: 260, marginBottom: 14 }}>
              <MField label={`Valutakurs (SEK per 1 ${currency})`}>
                <input style={mInputBase} type="number" step="0.0001" value={exchangeRate}
                  onChange={e => handleExchangeRateChange(e.target.value)} placeholder="11.50" />
              </MField>
            </div>
          )}

          <div style={{ maxWidth: 160, marginBottom: 14 }}>
            <MField label="Momssats (%)">
              <input style={mInputBase} type="number" step="1" value={vatRate}
                onChange={e => handleVatRateChange(e.target.value)} placeholder="25" />
            </MField>
          </div>
          <div style={m.grid3}>
            <MField label="Brutto inkl. moms (SEK)">
              <input style={mInputBase} type="number" step="0.01" value={amountGross}
                onChange={e => handleGrossChange(e.target.value)} placeholder="249.90" />
            </MField>
            <MField label="Netto exkl. moms (SEK)">
              <input style={mInputBase} type="number" step="0.01" value={amountNet}
                onChange={e => handleNetChange(e.target.value)} placeholder="199.92" />
            </MField>
            <MField label="Momsbelopp (SEK)">
              <input style={mInputBase} type="number" step="0.01" value={vatAmount}
                onChange={e => setVatAmount(e.target.value)} placeholder="49.98" />
            </MField>
          </div>

          {error && <div style={m.errBox}>⚠️ {error}</div>}
        </div>

        <div style={m.footer}>
          <button style={m.btnSecondary} onClick={onClose}>Avbryt</button>
          <button style={{ ...m.btnPrimary, opacity: loading ? 0.6 : 1 }} onClick={handleSave} disabled={loading || success}>
            {loading ? '⏳ Sparar...' : '💾 Spara kvitto'}
          </button>
        </div>

      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Huvud-uploader                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function ReceiptUploader({ onOcrDone, onImported, authName = null }) {
  const [file,        setFile]        = useState(null)
  const [preview,     setPreview]     = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [dragging,    setDragging]    = useState(false)
  const [showImport,  setShowImport]  = useState(false)
  const [showManual,  setShowManual]  = useState(false)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('Filen måste vara en bild (JPG, PNG, etc.)'); return }
    setError(null); setFile(f); setPreview(URL.createObjectURL(f))
  }

  const handleScan = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ocr', { method: 'POST', body: form })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'OCR misslyckades') }
      onOcrDone(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    {showImport && (
      <CsvImportModal
        onClose={() => setShowImport(false)}
        onImported={() => { setShowImport(false); if (onImported) onImported() }}
      />
    )}
    {showManual && (
      <ManualReceiptModal
        onClose={() => setShowManual(false)}
        onSaved={() => { setShowManual(false); if (onImported) onImported() }}
        authName={authName}
      />
    )}
    <div style={s.card}>
      <div
        style={s.dropzone(dragging)}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
      >
        {preview
          ? <img src={preview} alt="Kvitto" style={s.preview} />
          : <>
              <div style={s.icon}>📄</div>
              <p style={s.dropText}><strong>Klicka för att välja bild</strong><br />eller dra och släpp här</p>
              <p style={s.hint}>JPG, PNG, TIFF · max 10 MB</p>
            </>
        }
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])} />
      {file && <p style={s.filename}>📎 {file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
      <button style={s.btn(!file || loading)} onClick={handleScan} disabled={!file || loading}>
        {loading ? '⏳  Analyserar med Claude AI...' : '🔍  Scanna kvitto'}
      </button>
      <div style={{ textAlign: 'center', margin: '16px 0 4px', color: C.textMuted, fontSize: 13 }}>
        eller
      </div>
      <button
        style={{
          width: '100%', padding: '12px 0',
          background: 'transparent',
          color: C.textMuted,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          fontSize: 15, fontWeight: 600,
          cursor: 'pointer',
        }}
        onClick={() => setShowManual(true)}
      >
        ✏️  Registrera manuellt
      </button>
      <div style={{ textAlign: 'center', margin: '12px 0 4px', color: C.textMuted, fontSize: 13 }}>
        eller
      </div>
      <button
        style={{
          width: '100%', padding: '12px 0',
          background: 'transparent',
          color: C.accent,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          fontSize: 15, fontWeight: 600,
          cursor: 'pointer',
        }}
        onClick={() => setShowImport(true)}
      >
        📂  Importera från fil
      </button>
      {error && <div style={s.error}>⚠️ {error}</div>}
    </div>
    </>
  )
}
