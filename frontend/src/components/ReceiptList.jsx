import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

/* ─── Färger ──────────────────────────────────────────────────────────────── */
const C = {
  surface: '#1a1d27', surfaceDeep: '#13151f', border: '#2d3148',
  accent: '#3b82f6', text: '#e2e8f0', textMuted: '#8892a4', textDim: '#4a5568',
  green: '#34d399', red: '#f87171', redBg: 'rgba(248,113,113,0.1)',
  overlay: 'rgba(0,0,0,0.72)',
}
const USER_COLORS = ['#3b82f6','#34d399','#fbbf24','#f87171','#38bdf8','#f472b6','#a78bfa','#fb923c']

/* ─── Input bas-stil (fontSize 16 = inga iOS-zoom) ───────────────────────── */
const inputBase = {
  background: C.surfaceDeep, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '9px 11px', fontSize: 16,
  color: C.text, outline: 'none', width: '100%',
  height: 42, boxSizing: 'border-box', WebkitAppearance: 'none',
}

/* ─── Hjälpfunktioner ─────────────────────────────────────────────────────── */
const shortDate = (iso) => iso ? new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) : ''
const fullDate  = (iso) => iso ? new Date(iso).toLocaleDateString('sv-SE') : '—'
const fmtKr     = (v)   => v != null
  ? Number(v).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
  : null
const lastNDays = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (n - 1 - i))
  return d.toISOString().slice(0, 10)
})

/* ─── Tooltip ─────────────────────────────────────────────────────────────── */
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: C.surfaceDeep, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <p style={{ color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill, margin: '2px 0' }}>
          {p.name}: <strong>{Number(p.value).toFixed(2)} kr</strong>
        </p>
      ))}
    </div>
  )
}

/* ─── Modalfält – definierade UTANFÖR ReceiptModal (iOS keyboard-fix) ────── */
const mf = {
  field:      { display: 'flex', flexDirection: 'column', gap: 5 },
  label:      { fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' },
  value:      { fontSize: 15, color: C.text, padding: '4px 0' },
  valueMuted: { fontSize: 15, color: C.textMuted, fontStyle: 'italic', padding: '4px 0' },
}
function MField({ label, children }) {
  return (
    <div style={mf.field}>
      <span style={mf.label}>{label}</span>
      {children}
    </div>
  )
}
function MVal({ v, fallback = '—' }) {
  return <span style={v ? mf.value : mf.valueMuted}>{v || fallback}</span>
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Detaljmodal                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */
function ReceiptModal({ receipt, userColor, onClose, onUpdated, onDeleted, onRestored, isDeleted = false }) {
  const [editing,     setEditing]     = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [restoring,   setRestoring]   = useState(false)
  const [error,       setError]       = useState(null)

  /* Redigerbara fält */
  const [userName,    setUserName]    = useState(receipt.user_name    ?? '')
  const [storeName,   setStoreName]   = useState(receipt.store_name   ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt.receipt_date ?? '')
  const [amountGross, setAmountGross] = useState(receipt.amount_gross != null ? String(receipt.amount_gross) : '')
  const [amountNet,   setAmountNet]   = useState(receipt.amount_net   != null ? String(receipt.amount_net)   : '')
  const [vatAmount,   setVatAmount]   = useState(receipt.vat_amount   != null ? String(receipt.vat_amount)   : '')
  const [vatRate,     setVatRate]     = useState(receipt.vat_rate     != null ? String(receipt.vat_rate)     : '')
  const [comment,     setComment]     = useState(receipt.comment      ?? '')

  /* Stäng på Escape */
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const parse = (v) => v !== '' ? parseFloat(String(v).replace(',', '.')) : null

  const calcFromGross = (gross, rate) => {
    const g = parseFloat(String(gross).replace(',', '.'))
    const r = parseFloat(String(rate).replace(',', '.'))
    if (!isNaN(g) && !isNaN(r) && r > 0) {
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
    if (!isNaN(net) && !isNaN(r) && r > 0) {
      const gross = net * (1 + r / 100)
      setAmountGross(gross.toFixed(2))
      setVatAmount((gross - net).toFixed(2))
    }
  }

  const handleVatRateChange = (val) => {
    setVatRate(val)
    const r = parseFloat(String(val).replace(',', '.'))
    if (!isNaN(r) && r > 0) {
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

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_name: userName || null,
          store_name: storeName || null,
          amount_gross: parse(amountGross),
          amount_net: parse(amountNet),
          vat_amount: parse(vatAmount),
          vat_rate: parse(vatRate),
          receipt_date: receiptDate || null,
          comment: comment || null,
        }),
      })
      if (!res.ok) throw new Error('Kunde inte spara ändringar')
      const updated = await res.json()
      onUpdated(updated)
      setEditing(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true); setError(null)
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Kunde inte radera')
      onDeleted(receipt.id, receipt)
      onClose()
    } catch (e) { setError(e.message); setDeleting(false); setConfirmDel(false) }
  }

  const handleRestore = async () => {
    setRestoring(true); setError(null)
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/restore`, { method: 'POST' })
      if (!res.ok) throw new Error('Kunde inte återskapa kvittot')
      onRestored(receipt.id)
    } catch (e) { setError(e.message); setRestoring(false) }
  }

  const user = receipt.user_name || 'Okänd'
  const color = userColor[user] || C.textMuted

  /* ── Stilar ── */
  const m = {
    overlay: {
      position: 'fixed', inset: 0, background: C.overlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px',
    },
    box: {
      background: C.surface, borderRadius: 18,
      border: `1px solid ${C.border}`,
      width: '100%', maxWidth: 540,
      maxHeight: '90vh', overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    },
    header: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 24px 0',
    },
    storeName: { fontSize: 18, fontWeight: 700, color: C.text },
    closeBtn: {
      background: 'none', border: 'none', cursor: 'pointer',
      color: C.textMuted, fontSize: 22, lineHeight: 1, padding: '4px 6px',
    },
    img: {
      width: '100%', maxHeight: 220, objectFit: 'contain',
      borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
      marginTop: 16, background: C.surfaceDeep,
    },
    body: { padding: '20px 24px' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 },
    field: { display: 'flex', flexDirection: 'column', gap: 5 },
    label: { fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' },
    value: { fontSize: 15, color: C.text, padding: '4px 0' },
    valueMuted: { fontSize: 15, color: C.textMuted, fontStyle: 'italic', padding: '4px 0' },
    divider: { height: 1, background: C.border, margin: '16px 0' },
    sectionLabel: { fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 },
    footer: {
      padding: '16px 24px 20px',
      borderTop: `1px solid ${C.border}`,
      display: 'flex', gap: 10, alignItems: 'center',
    },
    btnPrimary: {
      flex: 1, padding: '11px 0', background: C.accent, color: '#fff',
      border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    btnSecondary: {
      padding: '11px 16px', background: C.surfaceDeep, color: C.textMuted,
      border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    btnDanger: {
      padding: '11px 16px', background: C.redBg, color: C.red,
      border: `1px solid ${C.red}`, borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    confirmRow: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 },
    confirmText: { fontSize: 13, color: C.textMuted, flex: 1 },
    errorMsg: { fontSize: 13, color: C.red, padding: '0 24px 12px' },
    textarea: {
      background: C.surfaceDeep, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '9px 11px', fontSize: 16, color: C.text, outline: 'none',
      resize: 'vertical', minHeight: 68, width: '100%', boxSizing: 'border-box',
    },
  }

  // Field och Val är definierade på modulnivå som MField/MVal (iOS keyboard-fix)

  return (
    <div style={m.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={m.box}>

        {/* Header */}
        <div style={m.header}>
          <div>
            <div style={m.storeName}>{storeName || receipt.store_name || 'Kvitto'}</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />
              {user} · {fullDate(receipt.receipt_date)}
            </div>
          </div>
          <button style={m.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Bild */}
        {receipt.has_image && (
          <img src={`/api/receipts/${receipt.id}/image`} alt="Kvitto" style={m.img} />
        )}

        {/* Body */}
        <div style={m.body}>
          {receipt.is_archive_summary && (
            <div style={{
              background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#a78bfa', marginBottom: 16,
            }}>
              📦 Detta är en arkivsammanfattning och kan inte redigeras.
            </div>
          )}
          {editing ? (
            <>
              <div style={m.sectionLabel}>Inlämnad av</div>
              <div style={{ ...m.grid2, marginBottom: 14 }}>
                <MField label="Namn">
                  <input style={inputBase} type="text" value={userName} onChange={e => setUserName(e.target.value)} />
                </MField>
                <MField label="Butik / företag">
                  <input style={inputBase} type="text" value={storeName} onChange={e => setStoreName(e.target.value)} />
                </MField>
              </div>
              <MField label="Kommentar">
                <textarea style={m.textarea} value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Projektnamn, kontostring..." />
              </MField>

              <div style={m.divider} />
              <div style={m.sectionLabel}>Kvittoinformation</div>
              <div style={{ ...m.grid2, marginBottom: 14 }}>
                <MField label="Datum">
                  <input style={inputBase} type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
                </MField>
              </div>

              <div style={m.sectionLabel}>Belopp & moms</div>
              <div style={{ maxWidth: 160, marginBottom: 14 }}>
                <MField label="Momssats (%)">
                  <input style={inputBase} type="number" step="1" value={vatRate} onChange={e => handleVatRateChange(e.target.value)} placeholder="25" />
                </MField>
              </div>
              <div style={m.grid3}>
                <MField label="Brutto inkl. moms">
                  <input style={inputBase} type="number" step="0.01" value={amountGross} onChange={e => handleGrossChange(e.target.value)} placeholder="249.90" />
                </MField>
                <MField label="Netto exkl. moms">
                  <input style={inputBase} type="number" step="0.01" value={amountNet} onChange={e => handleNetChange(e.target.value)} placeholder="199.92" />
                </MField>
                <MField label="Momsbelopp">
                  <input style={inputBase} type="number" step="0.01" value={vatAmount} onChange={e => setVatAmount(e.target.value)} placeholder="49.98" />
                </MField>
              </div>
            </>
          ) : (
            <>
              <div style={m.grid2}>
                <MField label="Användare"><MVal v={receipt.user_name} /></MField>
                <MField label="Butik"><MVal v={receipt.store_name} /></MField>
              </div>
              <div style={{ marginBottom: 14 }}>
                <MField label="Kommentar"><MVal v={receipt.comment} fallback="Ingen kommentar" /></MField>
              </div>

              <div style={m.divider} />
              <div style={m.sectionLabel}>Belopp & moms</div>
              <div style={m.grid3}>
                <MField label="Brutto inkl. moms"><MVal v={fmtKr(receipt.amount_gross)} /></MField>
                <MField label="Netto exkl. moms"><MVal v={fmtKr(receipt.amount_net)} /></MField>
                <MField label="Momsbelopp"><MVal v={fmtKr(receipt.vat_amount)} /></MField>
              </div>
              {receipt.vat_rate != null && (
                <div style={{ marginTop: 10 }}>
                  <MField label="Momssats"><MVal v={`${receipt.vat_rate}%`} /></MField>
                </div>
              )}
            </>
          )}
        </div>

        {error && <div style={m.errorMsg}>⚠️ {error}</div>}

        {/* Footer */}
        <div style={m.footer}>
          {receipt.is_archive_summary ? (
            <button style={m.btnSecondary} onClick={onClose}>Stäng</button>
          ) : isDeleted ? (
            <>
              <button style={m.btnSecondary} onClick={onClose}>Stäng</button>
              <button style={{ ...m.btnPrimary, background: '#34d399' }} onClick={handleRestore} disabled={restoring}>
                {restoring ? '⏳ Återskapar...' : '↩️ Återskapa kvitto'}
              </button>
            </>
          ) : editing ? (
            <>
              <button style={m.btnSecondary} onClick={() => { setEditing(false); setError(null) }}>Avbryt</button>
              <button style={m.btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Sparar...' : '💾 Spara'}
              </button>
            </>
          ) : confirmDel ? (
            <div style={m.confirmRow}>
              <span style={m.confirmText}>Flytta till papperskorgen?</span>
              <button style={m.btnSecondary} onClick={() => setConfirmDel(false)}>Nej</button>
              <button style={m.btnDanger} onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : 'Ja, radera'}
              </button>
            </div>
          ) : (
            <>
              <button style={m.btnDanger} onClick={() => setConfirmDel(true)}>🗑 Radera</button>
              <button style={{ ...m.btnSecondary, flex: 1 }} onClick={onClose}>Stäng</button>
              <button style={m.btnPrimary} onClick={() => setEditing(true)}>✏️ Redigera</button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Exportpanel                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */
function ExportPanel() {
  const today    = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo,   setDateTo]   = useState(today)
  const [open,     setOpen]     = useState(false)

  const handleExport = () => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo)   params.set('to',   dateTo)
    // Använd <a>-element för att ladda ner utan att navigera bort från sidan
    const a = document.createElement('a')
    a.href = `/api/receipts/export?${params.toString()}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '8px 16px', background: 'transparent',
            color: C.accent, border: `1px solid ${C.border}`,
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ⬇️ Exportera CSV
        </button>
      ) : (
        <div style={{
          background: C.surfaceDeep, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '16px 18px',
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Från</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ ...inputBase, width: 150 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Till</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ ...inputBase, width: 150 }} />
          </div>
          <button onClick={handleExport} style={{
            padding: '9px 20px', background: C.accent, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', height: 42,
          }}>
            ⬇️ Ladda ner
          </button>
          <button onClick={() => setOpen(false)} style={{
            padding: '9px 14px', background: 'transparent', color: C.textMuted,
            border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', height: 42,
          }}>
            Avbryt
          </button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Arkiveringspanel                                                           */
/* ══════════════════════════════════════════════════════════════════════════ */
function ArchivePanel({ onArchived }) {
  const [open,          setOpen]         = useState(false)
  const [years,         setYears]        = useState([])
  const [selectedYear,  setSelectedYear] = useState('')
  const [preview,       setPreview]      = useState(null)
  const [loadingYears,  setLoadingYears] = useState(false)
  const [loadingPrev,   setLoadingPrev]  = useState(false)
  const [confirming,    setConfirming]   = useState(false)
  const [archiving,     setArchiving]    = useState(false)
  const [result,        setResult]       = useState(null)
  const [error,         setError]        = useState(null)

  const openPanel = async () => {
    setOpen(true)
    setLoadingYears(true)
    setError(null)
    try {
      const res = await fetch('/api/receipts/years')
      if (res.ok) setYears(await res.json())
    } catch { /* noop */ }
    finally { setLoadingYears(false) }
  }

  const handleYearChange = async (yr) => {
    setSelectedYear(yr)
    setPreview(null)
    setConfirming(false)
    setError(null)
    if (!yr) return
    setLoadingPrev(true)
    try {
      const res = await fetch(`/api/receipts/archive-preview/${yr}`)
      if (res.ok) setPreview(await res.json())
      else { const e = await res.json(); setError(e.detail || 'Kunde inte hämta förhandsgranskning') }
    } catch { setError('Nätverksfel') }
    finally { setLoadingPrev(false) }
  }

  const handleArchive = async () => {
    setArchiving(true); setError(null)
    try {
      const res = await fetch(`/api/receipts/archive/${selectedYear}`, { method: 'POST' })
      if (res.ok) {
        setResult(await res.json())
        setConfirming(false)
        onArchived()
      } else { const e = await res.json(); setError(e.detail || 'Arkivering misslyckades') }
    } catch { setError('Nätverksfel') }
    finally { setArchiving(false) }
  }

  const handleClose = () => {
    setOpen(false); setSelectedYear(''); setPreview(null)
    setConfirming(false); setResult(null); setError(null)
  }

  const fmtKrLocal = (v) => v != null
    ? Number(v).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
    : '—'

  const archivableCount = preview && !preview.already_archived ? preview.total_receipts : 0

  if (!open) {
    return (
      <button onClick={openPanel} style={{
        padding: '8px 16px', background: 'transparent',
        color: '#a78bfa', border: `1px solid ${C.border}`,
        borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>
        📦 Arkivera år
      </button>
    )
  }

  return (
    <div style={{
      background: C.surfaceDeep, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '16px 18px', minWidth: 280,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>📦 Arkivera år</span>
        <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {result ? (
        <div>
          <div style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
            ✅ {result.archived_count} kvitton arkiverade för {result.year}. {result.summaries_created} sammanfattning{result.summaries_created !== 1 ? 'ar' : ''} skapade.
          </div>
          <button onClick={handleClose} style={{ padding: '8px 16px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Stäng
          </button>
        </div>
      ) : confirming ? (
        <div>
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#fcd34d', marginBottom: 14 }}>
            ⚠️ Du är på väg att arkivera <strong>{archivableCount} kvitton</strong> för {selectedYear}.<br />
            <span style={{ color: '#d97706', fontSize: 12 }}>Detta kan inte ångras från gränssnittet.</span>
          </div>
          {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>⚠️ {error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirming(false)} style={{ padding: '8px 14px', background: 'transparent', color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Avbryt</button>
            <button onClick={handleArchive} disabled={archiving} style={{ padding: '8px 16px', background: '#a78bfa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: archiving ? 'not-allowed' : 'pointer', opacity: archiving ? 0.6 : 1 }}>
              {archiving ? '⏳ Arkiverar...' : '📦 Bekräfta arkivering'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Välj år</span>
            <select
              value={selectedYear}
              onChange={e => handleYearChange(e.target.value)}
              style={{ ...inputBase, width: 150, cursor: 'pointer' }}
            >
              <option value="">{loadingYears ? 'Laddar...' : '— Välj år —'}</option>
              {years.map(y => (
                <option key={y.year} value={y.year}>
                  {y.year}{y.is_archived ? ' (arkiverat)' : ` · ${y.receipt_count} kvitton`}
                </option>
              ))}
            </select>
          </div>

          {loadingPrev && <div style={{ fontSize: 13, color: C.textMuted }}>⏳ Hämtar förhandsgranskning...</div>}

          {preview && (
            <div style={{ marginBottom: 14 }}>
              {preview.already_archived && (
                <div style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#a78bfa', marginBottom: 10 }}>
                  📦 {selectedYear} är redan arkiverat.
                  {preview.total_receipts > 0 && ` (${preview.total_receipts} nya kvitton har lagts till efter arkiveringen och ingår inte.)`}
                </div>
              )}
              {preview.undated_count > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fcd34d', marginBottom: 10 }}>
                  ⚠️ {preview.undated_count} kvitton saknar datum och ingår inte i arkiveringen.
                </div>
              )}
              {preview.total_receipts > 0 && !preview.already_archived && (
                <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '6px 10px', background: C.surfaceDeep, color: C.textMuted, fontWeight: 600, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>Användare</th>
                        <th style={{ padding: '6px 10px', background: C.surfaceDeep, color: C.textMuted, fontWeight: 600, textAlign: 'right', borderBottom: `1px solid ${C.border}` }}>Kvitton</th>
                        <th style={{ padding: '6px 10px', background: C.surfaceDeep, color: C.textMuted, fontWeight: 600, textAlign: 'right', borderBottom: `1px solid ${C.border}` }}>Nettosumma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.users.map((u, i) => (
                        <tr key={i}>
                          <td style={{ padding: '5px 10px', color: C.text, borderBottom: `1px solid rgba(45,49,72,0.4)` }}>{u.user_name || 'Okänd'}</td>
                          <td style={{ padding: '5px 10px', color: C.textMuted, textAlign: 'right', borderBottom: `1px solid rgba(45,49,72,0.4)` }}>{u.receipt_count}</td>
                          <td style={{ padding: '5px 10px', color: C.text, fontWeight: 600, textAlign: 'right', borderBottom: `1px solid rgba(45,49,72,0.4)` }}>{fmtKrLocal(u.amount_net_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview.total_receipts === 0 && !preview.already_archived && (
                <div style={{ fontSize: 13, color: C.textMuted }}>Inga kvitton att arkivera för {selectedYear}.</div>
              )}
            </div>
          )}

          {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>⚠️ {error}</div>}

          <button
            onClick={() => setConfirming(true)}
            disabled={!preview || preview.already_archived || archivableCount === 0}
            style={{
              padding: '8px 16px', background: '#a78bfa', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: (!preview || preview.already_archived || archivableCount === 0) ? 'not-allowed' : 'pointer',
              opacity: (!preview || preview.already_archived || archivableCount === 0) ? 0.4 : 1,
            }}
          >
            📦 Arkivera {selectedYear || '…'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Huvudkomponent                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export default function ReceiptList() {
  const [receipts,        setReceipts]        = useState([])
  const [deletedReceipts, setDeletedReceipts] = useState([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [selected,        setSelected]        = useState(null)
  const [showDeleted,     setShowDeleted]     = useState(false)
  const [page,            setPage]            = useState(1)
  const [pageSize,        setPageSize]        = useState(25)

  const fetchAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/receipts').then(r => r.ok ? r.json() : Promise.reject('Kunde inte hämta kvitton')),
      fetch('/api/receipts/deleted').then(r => r.ok ? r.json() : Promise.reject('Kunde inte hämta raderade kvitton')),
    ])
      .then(([active, deleted]) => { setReceipts(active); setDeletedReceipts(deleted); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleUpdated = useCallback((updated) => {
    setReceipts(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r))
    setSelected(prev => prev ? { ...prev, ...updated } : prev)
  }, [])

  const handleDeleted = useCallback((id, receiptData) => {
    setReceipts(prev => prev.filter(r => r.id !== id))
    if (receiptData) setDeletedReceipts(prev => [receiptData, ...prev])
  }, [])

  const handleRestored = useCallback((id) => {
    const r = deletedReceipts.find(x => x.id === id)
    setDeletedReceipts(prev => prev.filter(x => x.id !== id))
    if (r) setReceipts(prev => [r, ...prev])
    setSelected(null)
  }, [deletedReceipts])

  /* ── Diagram ── */
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const recent  = receipts.filter(r => r.receipt_date && r.receipt_date >= cutoffStr)
  const users   = [...new Set(receipts.map(r => r.user_name || 'Okänd'))].slice(0, 8)
  const userColor = Object.fromEntries(users.map((u, i) => [u, USER_COLORS[i % USER_COLORS.length]]))
  const days    = lastNDays(30)
  const chartData = days.map(day => {
    const row = { date: shortDate(day) }
    users.forEach(u => { row[u] = 0 })
    recent.filter(r => r.receipt_date === day).forEach(r => {
      const u = r.user_name || 'Okänd'
      row[u] = (row[u] || 0) + (r.amount_net || r.amount_gross || 0)
    })
    return row
  })
  const hasChart = chartData.some(d => users.some(u => d[u] > 0))

  /* ── Sortera ── */
  const sorted = [...receipts].sort((a, b) => {
    const da = a.receipt_date || a.created_at || ''
    const db = b.receipt_date || b.created_at || ''
    return db.localeCompare(da)
  })

  /* ── Paginering ── */
  const totalPages  = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage    = Math.min(page, totalPages)
  const pageStart   = (safePage - 1) * pageSize
  const paginated   = sorted.slice(pageStart, pageStart + pageSize)

  /* ── Totaler ── */
  const perUser = {}
  receipts.forEach(r => {
    const u = r.user_name || 'Okänd'
    if (!perUser[u]) perUser[u] = { total: 0, count: 0 }
    perUser[u].total += r.amount_net || r.amount_gross || 0
    perUser[u].count++
  })
  const grandTotal = Object.values(perUser).reduce((s, v) => s + v.total, 0)

  /* ── Stilar ── */
  const s = {
    card: { background: C.surface, borderRadius: 16, padding: 28, border: `1px solid ${C.border}` },
    title: { fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 },
    subtitle: { fontSize: 13, color: C.textMuted, marginBottom: 24 },
    divider: { height: 1, background: C.border, marginBottom: 20 },
    sectionLabel: { fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 },
    noData: { textAlign: 'center', color: C.textMuted, padding: '32px 0' },
    // Lista
    listItem: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 12px', borderRadius: 10, cursor: 'pointer',
      transition: 'background 0.15s', marginBottom: 2,
    },
    itemLeft: { flex: 1, minWidth: 0, marginRight: 12 },
    itemRow1: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 },
    itemStore: { fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    itemRow2: { display: 'flex', alignItems: 'center', gap: 8 },
    itemUser: { fontSize: 12, color: C.textMuted, display: 'flex', alignItems: 'center' },
    itemDate: { fontSize: 12, color: C.textDim },
    dot: (color) => ({ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 5 }),
    itemRight: { textAlign: 'right', flexShrink: 0 },
    itemAmount: { fontSize: 14, fontWeight: 700, color: C.text },
    itemAmountSub: { fontSize: 11, color: C.textMuted, marginTop: 1 },
    // Totaler
    totalRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` },
    totalUser: { display: 'flex', alignItems: 'center', fontSize: 14, color: C.text, fontWeight: 600 },
    totalAmount: { fontSize: 14, fontWeight: 700, color: C.text },
    totalCount: { fontSize: 12, color: C.textMuted, marginLeft: 8 },
    grandTotal: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginTop: 4 },
    grandLabel: { fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' },
    grandAmount: { fontSize: 18, fontWeight: 700, color: C.text },
    error: { background: C.redBg, color: C.red, borderRadius: 8, padding: '10px 14px', fontSize: 14 },
    loading: { textAlign: 'center', color: C.textMuted, padding: '32px 0' },
  }

  if (loading) return <div style={s.card}><div style={s.loading}>⏳ Laddar...</div></div>
  if (error)   return <div style={s.card}><div style={s.error}>⚠️ {error}</div></div>

  return (
    <>
      {selected && (
        <ReceiptModal
          receipt={selected}
          userColor={userColor}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onRestored={handleRestored}
          isDeleted={selected._isDeleted}
        />
      )}

      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ ...s.title, marginBottom: 2 }}>📊 Utlägg senaste 30 dagarna</h2>
            <p style={s.subtitle}>Belopp exkl. moms per användare · {receipts.length} kvitton totalt</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ExportPanel />
            <ArchivePanel onArchived={fetchAll} />
          </div>
        </div>

        {/* Diagram */}
        <div style={{ marginBottom: 32 }}>
          {!hasChart ? (
            <div style={s.noData}>🧾 Inga kvitton med datum inom 30 dagar</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} interval={Math.floor(days.length / 6)} />
                <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v} kr`} />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: C.textMuted, paddingTop: 12 }} />
                {users.map((u, i) => (
                  <Bar key={u} dataKey={u} stackId="a" fill={userColor[u]}
                    radius={i === users.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={s.divider} />

        {/* Totalsumma per användare – direkt under grafen */}
        {Object.keys(perUser).length > 0 && (
          <>
            <div style={s.sectionLabel}>Totalt per användare</div>
            {Object.entries(perUser)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([user, { total, count }]) => (
                <div key={user} style={s.totalRow}>
                  <div style={s.totalUser}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: userColor[user] || C.textMuted, marginRight: 8 }} />
                    {user}
                    <span style={s.totalCount}>({count} kvitto{count !== 1 ? 'n' : ''})</span>
                  </div>
                  <div style={s.totalAmount}>{fmtKr(total)}</div>
                </div>
              ))}
            <div style={s.grandTotal}>
              <div style={s.grandLabel}>Totalt alla</div>
              <div style={s.grandAmount}>{fmtKr(grandTotal)}</div>
            </div>
          </>
        )}

        <div style={{ ...s.divider, marginTop: 8 }} />

        {/* Lista – rubrik + sidväljare */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...s.sectionLabel, marginBottom: 0 }}>
            Alla utlägg · klicka för detaljer
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>Visa</span>
            {PAGE_SIZE_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => { setPageSize(n); setPage(1) }}
                style={{
                  padding: '3px 9px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${pageSize === n ? C.accent : C.border}`,
                  background: pageSize === n ? 'rgba(59,130,246,0.15)' : C.surfaceDeep,
                  color: pageSize === n ? C.accent : C.textMuted,
                  fontWeight: pageSize === n ? 700 : 400,
                  lineHeight: '1.4',
                }}
              >{n}</button>
            ))}
            <span style={{ fontSize: 12, color: C.textMuted }}>/ sida</span>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div style={s.noData}>Inga kvitton sparade ännu.</div>
        ) : paginated.map(r => {
          const user      = r.user_name || 'Okänd'
          const color     = userColor[user] || C.textMuted
          const net       = r.amount_net ?? r.amount_gross
          const isSummary = r.is_archive_summary
          return (
            <div
              key={r.id}
              style={{
                ...s.listItem,
                ...(isSummary ? { background: 'rgba(167,139,250,0.04)', borderLeft: '3px solid rgba(167,139,250,0.4)', paddingLeft: 10 } : {}),
              }}
              onClick={() => setSelected(r)}
              onMouseEnter={e => e.currentTarget.style.background = isSummary ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = isSummary ? 'rgba(167,139,250,0.04)' : 'transparent'}
            >
              <div style={s.itemLeft}>
                <div style={s.itemRow1}>
                  <span style={isSummary ? { ...s.itemStore, color: '#a78bfa' } : s.itemStore}>
                    {isSummary ? '📦 ' : ''}{r.store_name || '(okänd butik)'}
                  </span>
                </div>
                <div style={s.itemRow2}>
                  <span style={s.itemUser}>
                    <span style={s.dot(color)} />{user}
                  </span>
                  {r.receipt_date && <span style={s.itemDate}>{fullDate(r.receipt_date)}</span>}
                  {r.comment && <span style={{ fontSize: 11, color: C.textDim, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>"{r.comment}"</span>}
                </div>
              </div>
              <div style={s.itemRight}>
                <div style={s.itemAmount}>{net != null ? fmtKr(net) : '—'}</div>
                {r.amount_gross != null && r.amount_net != null && (
                  <div style={s.itemAmountSub}>{fmtKr(r.amount_gross)} brutto</div>
                )}
              </div>
            </div>
          )
        })}

        {/* Sidnavigation */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{ padding: '6px 14px', borderRadius: 7, fontSize: 13, cursor: safePage === 1 ? 'default' : 'pointer', border: `1px solid ${C.border}`, background: C.surfaceDeep, color: safePage === 1 ? C.textDim : C.textMuted }}
            >← Föregående</button>
            <span style={{ fontSize: 13, color: C.textMuted, minWidth: 120, textAlign: 'center' }}>
              Sida {safePage} av {totalPages}
              <span style={{ color: C.textDim, marginLeft: 6 }}>({sorted.length} st)</span>
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{ padding: '6px 14px', borderRadius: 7, fontSize: 13, cursor: safePage === totalPages ? 'default' : 'pointer', border: `1px solid ${C.border}`, background: C.surfaceDeep, color: safePage === totalPages ? C.textDim : C.textMuted }}
            >Nästa →</button>
          </div>
        )}

        {/* Raderade kvitton */}
        {deletedReceipts.length > 0 && (
          <>
            <div style={{ ...s.divider, marginTop: 20 }} />
            <button
              onClick={() => setShowDeleted(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: showDeleted ? 12 : 0 }}
            >
              <span style={{ ...s.sectionLabel, marginBottom: 0, color: C.red }}>
                🗑 Raderade kvitton ({deletedReceipts.length})
              </span>
              <span style={{ fontSize: 12, color: C.textMuted }}>{showDeleted ? '▲ Dölj' : '▼ Visa'}</span>
            </button>

            {showDeleted && deletedReceipts.map(r => {
              const user  = r.user_name || 'Okänd'
              const net   = r.amount_net ?? r.amount_gross
              return (
                <div
                  key={r.id}
                  style={{ ...s.listItem, opacity: 0.55 }}
                  onClick={() => setSelected({ ...r, _isDeleted: true })}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}
                >
                  <div style={s.itemLeft}>
                    <div style={s.itemRow1}>
                      <span style={{ ...s.itemStore, textDecoration: 'line-through' }}>{r.store_name || '(okänd butik)'}</span>
                    </div>
                    <div style={s.itemRow2}>
                      <span style={s.itemUser}>{user}</span>
                      {r.receipt_date && <span style={s.itemDate}>{fullDate(r.receipt_date)}</span>}
                      {r.comment && <span style={{ fontSize: 11, color: C.textDim, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>"{r.comment}"</span>}
                    </div>
                  </div>
                  <div style={s.itemRight}>
                    <div style={{ ...s.itemAmount, textDecoration: 'line-through', color: C.textMuted }}>{net != null ? fmtKr(net) : '—'}</div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}
