import { useState, useEffect } from 'react'
import ReceiptUploader from './components/ReceiptUploader.jsx'
import ReceiptForm from './components/ReceiptForm.jsx'
import ReceiptList from './components/ReceiptList.jsx'

const C = {
  bg: '#0f1117', surface: '#1a1d27', border: '#2d3148',
  text: '#e2e8f0', textMuted: '#8892a4',
}

const s = {
  app: { minHeight: '100vh', background: C.bg, padding: '28px 16px 48px' },
  container: { maxWidth: 720, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 36 },
  title: {
    fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: '-0.5px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  subtitle: { fontSize: 14, color: C.textMuted, marginTop: 6 },
  authBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: 20, padding: '3px 12px', fontSize: 12, color: '#93c5fd',
    marginTop: 8,
  },
  tabs: {
    display: 'flex', gap: 2, marginBottom: 28,
    background: C.surface, borderRadius: 12, padding: 4,
    border: `1px solid ${C.border}`,
  },
  tab: (active) => ({
    flex: 1, padding: '9px 0', border: 'none', borderRadius: 9,
    cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.18s',
    background: active ? '#3b82f6' : 'transparent',
    color: active ? '#fff' : C.textMuted,
  }),
}

export default function App() {
  const [tab,        setTab]        = useState('scan')
  const [ocrResult,  setOcrResult]  = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [authUser,   setAuthUser]   = useState(null)   // { auth_enabled, display_name, username, email }

  // Hämta auth-info en gång vid start
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAuthUser(data) })
      .catch(() => {})  // tyst fel – auth är valfritt
  }, [])

  const handleOcrDone = (result) => { setOcrResult(result); setTab('review') }
  const handleSaved   = () => { setOcrResult(null); setRefreshKey(k => k + 1); setTab('history') }

  // Visningsnamn från Authelia: föredra Remote-Name, annars Remote-User
  const authName = authUser?.display_name || authUser?.username || null
  const authActive = authUser?.auth_enabled && authName

  return (
    <div style={s.app}>
      <div style={s.container}>
        <header style={s.header}>
          <h1 style={s.title}><span>🧾</span> Scanna kvitto</h1>
          {authActive ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
              <span style={s.authBadge}>👤 {authName}</span>
            </div>
          ) : (
            <p style={s.subtitle}>Scanna kvitton och spara dem automatiskt med AI</p>
          )}
        </header>

        <div style={s.tabs}>
          {[['scan','📷  Registrera'],['review','✏️  Granska'],['history','📋  Historik']].map(([key, label]) => (
            <button key={key} style={s.tab(tab === key)} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

        {tab === 'scan'    && <ReceiptUploader onOcrDone={handleOcrDone} onImported={() => { setRefreshKey(k => k + 1); setTab('history') }} authName={authName} />}
        {tab === 'review'  && <ReceiptForm ocrResult={ocrResult} onSaved={handleSaved} onBack={() => setTab('scan')} authName={authName} />}
        {tab === 'history' && <ReceiptList key={refreshKey} />}
      </div>
    </div>
  )
}
