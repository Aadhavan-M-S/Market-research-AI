import { useState, useCallback, useMemo, useRef } from 'react'
import {
  TrendingUp, Cpu, AlertCircle, ChevronDown, ChevronUp,
  ClipboardPaste, CheckCircle2, AlertTriangle, Table2,
  Loader2, Copy, Download, Sparkles, BarChart3, Activity,
  Zap,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import ReactMarkdown from 'react-markdown'
import { runTrendSpotting } from '../../api/client.js'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const NLP_TECHNIQUES = [
  { label: 'Topic Modeling (LDA)', color: '#1fe4c8' },
  { label: 'N-gram Models',        color: '#4f8ef7' },
  { label: 'Temporal Drift',       color: '#7c5cbf' },
  { label: 'Bag of Words',         color: '#f0894a' },
]

const TOPIC_COLORS = ['#4f8ef7', '#1fe4c8', '#7c5cbf', '#f0894a', '#e05ec9']

const CHART_GRID = 'rgba(255,255,255,0.05)'
const CHART_TICK = 'rgba(255,255,255,0.35)'
const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(15,18,30,0.97)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    color: '#e2e8f0',
  },
  cursor: { stroke: 'rgba(255,255,255,0.06)' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Date normalisation (preserved from v2)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeDate(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return isNaN(new Date(s)) ? null : s
  }
  const sd = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (sd) {
    let [, a, b, c] = sd
    if (c.length === 2) c = `20${c}`
    const year = parseInt(c, 10)
    let month, day
    if (parseInt(a, 10) > 12) { day = parseInt(a, 10); month = parseInt(b, 10) }
    else                       { month = parseInt(a, 10); day = parseInt(b, 10) }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return isNaN(new Date(iso)) ? null : iso
  }
  const fb = new Date(s)
  return isNaN(fb) ? null : fb.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// Paste parser (preserved from v2)
// ─────────────────────────────────────────────────────────────────────────────

function parsePastedData(raw) {
  const lines = raw.split('\n').filter(l => l.trim())
  let skipped = 0
  const valid = []
  for (const line of lines) {
    let parts
    if (line.includes('\t'))     parts = line.split('\t')
    else if (line.includes(',')) parts = line.split(',')
    else if (line.includes('|')) parts = line.split('|')
    else { skipped++; continue }
    if (parts.length < 2) { skipped++; continue }
    const rawDate   = parts[0].trim()
    const text      = parts.slice(1).join(' ').trim()
    if (!text) { skipped++; continue }
    const timestamp = normalizeDate(rawDate)
    if (!timestamp) { skipped++; continue }
    valid.push({ timestamp, text })
  }
  return { valid, skipped }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast hook
// ─────────────────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)
  const show = useCallback((msg, type = 'success') => {
    clearTimeout(timerRef.current)
    setToast({ msg, type })
    timerRef.current = setTimeout(() => setToast(null), 1600)
  }, [])
  return { toast, show }
}

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 16px',
      background: 'rgba(12,15,26,0.98)',
      border: '1px solid rgba(31,228,200,0.3)',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.76rem',
      color: '#1fe4c8',
      animation: 'toastIn 0.18s ease',
    }}>
      <CheckCircle2 size={14} />{toast.msg}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy button
// ─────────────────────────────────────────────────────────────────────────────

function CopyBtn({ text, label = 'Copy', showFn }) {
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); showFn(`${label} copied ✓`) }
        catch { showFn('Copy failed', 'error') }
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6, cursor: 'pointer',
        color: 'rgba(255,255,255,0.4)',
        fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(31,228,200,0.4)'; e.currentTarget.style.color = '#1fe4c8' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
    >
      <Copy size={11} />{label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section divider
// ─────────────────────────────────────────────────────────────────────────────

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 20px' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.63rem',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap',
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility atoms
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px',
      background: `${color}14`, border: `1px solid ${color}30`,
      borderRadius: 100, fontFamily: 'var(--font-mono)',
      fontSize: '0.72rem', color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function StatusBanner({ type, message }) {
  const cfg = {
    error:   { icon: <AlertCircle size={15} />,   bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  color: '#f87171' },
    warning: { icon: <AlertTriangle size={15} />, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#fbbf24' },
    success: { icon: <CheckCircle2 size={15} />,  bg: 'rgba(31,228,200,0.1)', border: 'rgba(31,228,200,0.3)', color: '#1fe4c8' },
  }
  const c = cfg[type]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', background: c.bg,
      border: `1px solid ${c.border}`, borderRadius: 8,
      color: c.color, fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
    }}>
      {c.icon}{message}
    </div>
  )
}

function PreviewTable({ rows, onEdit }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
        <thead>
          <tr>
            {['#', 'Date', 'Text'].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '8px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-muted)', fontWeight: 600,
                fontSize: '0.7rem', letterSpacing: '0.06em',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '7px 12px', color: 'var(--text-muted)', width: 36 }}>{i + 1}</td>
              <td style={{ padding: '7px 12px', whiteSpace: 'nowrap', color: '#1fe4c8' }}>{row.timestamp}</td>
              <td style={{ padding: '7px 12px' }}>
                <input value={row.text} onChange={e => onEdit(i, 'text', e.target.value)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit', width: '100%', cursor: 'text' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart components
// ─────────────────────────────────────────────────────────────────────────────

function trendColor(trend) {
  if (!trend) return '#64748b'
  if (trend.includes('rising'))    return '#1fe4c8'
  if (trend.includes('declining')) return '#f0894a'
  return '#64748b'
}

function SemanticDriftChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="period" tick={{ fill: CHART_TICK, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: CHART_TICK, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
        <Tooltip {...CHART_TOOLTIP_STYLE} formatter={v => [Number(v).toFixed(4), 'Drift']} />
        <Line
          type="monotone" dataKey="semantic_drift" stroke="#1fe4c8" strokeWidth={2}
          dot={{ fill: '#1fe4c8', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#1fe4c8', stroke: 'rgba(31,228,200,0.3)', strokeWidth: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function TopicEvolutionChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="topic_id" tick={{ fill: CHART_TICK, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `T${v}`} />
        <YAxis tick={{ fill: CHART_TICK, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
        <Tooltip {...CHART_TOOLTIP_STYLE} formatter={v => [Number(v).toFixed(4), 'Delta']} labelFormatter={v => `Topic ${v}`} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
        <Bar dataKey="delta" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={trendColor(entry.trend)} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function NgramVelocityChart({ data }) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => Math.abs(b.velocity) - Math.abs(a.velocity)).slice(0, 10),
    [data],
  )
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 30)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
        <XAxis type="number" tick={{ fill: CHART_TICK, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="ngram" width={115} tick={{ fill: CHART_TICK, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
        <Tooltip {...CHART_TOOLTIP_STYLE} formatter={v => [Number(v).toFixed(4), 'Velocity']} />
        <ReferenceLine x={0} stroke="rgba(255,255,255,0.1)" />
        <Bar dataKey="velocity" radius={[0, 3, 3, 0]}>
          {sorted.map((entry, i) => (
            <Cell key={i} fill={entry.velocity >= 0 ? '#4f8ef7' : '#f0894a'} fillOpacity={0.82} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF export (lazy-loaded)
// ─────────────────────────────────────────────────────────────────────────────

async function exportToPDF(reportEl) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])
  const canvas  = await html2canvas(reportEl, { scale: 2, backgroundColor: '#0d1117', useCORS: true, logging: false })
  const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pdfW    = pdf.internal.pageSize.getWidth()
  const pdfH    = pdf.internal.pageSize.getHeight()
  const imgData = canvas.toDataURL('image/png')
  const imgH    = (pdfW / canvas.width) * canvas.height
  let yOff      = 0
  while (yOff < imgH) {
    if (yOff > 0) pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, -yOff, pdfW, imgH)
    yOff += pdfH
  }
  pdf.save(`trend-intelligence-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Insight card
// ─────────────────────────────────────────────────────────────────────────────

function AIInsightCard({ narrative, showFn }) {
  return (
    <div className="glass-card" style={{ padding: 24, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(79,142,247,0.14)',
            border: '1px solid rgba(79,142,247,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={13} color="#4f8ef7" />
          </div>
          <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            AI Executive Insight
          </span>
        </div>
        <CopyBtn text={narrative} label="Narrative" showFn={showFn} />
      </div>
      <div style={{
        padding: '16px 20px',
        background: 'rgba(79,142,247,0.04)',
        border: '1px solid rgba(79,142,247,0.1)',
        borderRadius: 10,
        fontSize: '0.85rem', lineHeight: 1.8,
        color: 'rgba(226,232,240,0.88)',
      }}>
        <ReactMarkdown components={{
          h1: ({ children }) => <h1 style={{ fontSize: '1rem',   fontWeight: 700, color: '#e2e8f0', margin: '0 0 10px' }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#94a3b8', margin: '12px 0 6px', letterSpacing: '0.04em' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', margin: '8px 0 4px' }}>{children}</h3>,
          p:  ({ children }) => <p  style={{ margin: '0 0 10px' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '4px 0 10px', paddingLeft: 18 }}>{children}</ul>,
          li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
          strong: ({ children }) => <strong style={{ color: '#e2e8f0', fontWeight: 600 }}>{children}</strong>,
        }}>
          {narrative}
        </ReactMarkdown>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function TrendSpotting() {
  const [pasteInput,   setPasteInput]   = useState('')
  const [parsedRows,   setParsedRows]   = useState([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [parseError,   setParseError]   = useState(null)
  const [numTopics,    setNumTopics]    = useState(5)
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState(null)
  const [apiError,     setApiError]     = useState(null)
  const [showRaw,      setShowRaw]      = useState(false)
  const [pdfLoading,   setPdfLoading]   = useState(false)
  const debounceRef = useRef(null)
  const reportRef   = useRef(null)
  const { toast, show: showToast } = useToast()

  // ── Parse on paste ────────────────────────────────────────────────────────
  const handlePasteChange = useCallback((e) => {
    const raw = e.target.value
    setPasteInput(raw)
    setResult(null)
    setApiError(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (!raw.trim()) { setParsedRows([]); setSkippedCount(0); setParseError(null); return }
      const { valid, skipped } = parsePastedData(raw)
      setParsedRows(valid)
      setSkippedCount(skipped)
      setParseError(valid.length === 0 ? 'No valid rows detected. Check format: Date[sep]Text.' : null)
    }, 200)
  }, [])

  const handleEditRow = useCallback((i, key, value) => {
    setParsedRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r))
  }, [])

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (parsedRows.length === 0) { setParseError('No valid rows to submit. Paste data first.'); return }
    setApiError(null)
    setLoading(true)
    try {
      const data = await runTrendSpotting({
        texts:      parsedRows.map(r => r.text),
        timestamps: parsedRows.map(r => r.timestamp),
        n_topics:   Number(numTopics),
      })
      setResult(data)
    } catch (err) {
      setApiError(err?.message || 'Unexpected error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [parsedRows, numTopics])

  // ── PDF export ────────────────────────────────────────────────────────────
  const handleExportPDF = useCallback(async () => {
    if (!reportRef.current) return
    setPdfLoading(true)
    try {
      await exportToPDF(reportRef.current)
      showToast('Report downloaded ✓')
    } catch {
      showToast('PDF export failed', 'error')
    } finally {
      setPdfLoading(false)
    }
  }, [showToast])

  // ── Derived state (memoised) ──────────────────────────────────────────────
  const hasData      = parsedRows.length > 0
  const hasSkips     = skippedCount > 0
  const canSubmit    = hasData && !loading

  const aiNarrative  = useMemo(() => result?.topics?.find(t => t.topic_id === -1)?.narrative ?? null, [result])
  const actualTopics = useMemo(() => result?.topics?.filter(t => t.topic_id !== -1) ?? [], [result])
  const driftData    = useMemo(() => result?.temporal_trend   ?? [], [result])
  const evolutionData= useMemo(() => result?.topic_evolution  ?? [], [result])
  const ngramData    = useMemo(() => result?.trending_ngrams  ?? [], [result])
  const hasCharts    = driftData.length > 0 || evolutionData.length > 0 || ngramData.length > 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="agent-page">
      <Toast toast={toast} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11,
            background: 'rgba(31,228,200,0.12)',
            border: '1px solid rgba(31,228,200,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={20} color="#1fe4c8" />
          </div>
          <h1 className="agent-page__title" style={{
            background: 'linear-gradient(135deg,#1fe4c8,#4f8ef7)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Trend Intelligence Engine
          </h1>
        </div>
        {result && (
          <button
            onClick={handleExportPDF}
            disabled={pdfLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px',
              background: 'rgba(79,142,247,0.1)',
              border: '1px solid rgba(79,142,247,0.28)',
              borderRadius: 8, cursor: 'pointer',
              color: '#4f8ef7',
              fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,142,247,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,142,247,0.1)'  }}
          >
            {pdfLoading
              ? <><Loader2 size={14} style={{ animation: 'spin 0.9s linear infinite' }} />Exporting…</>
              : <><Download size={14} />Download Report</>
            }
          </button>
        )}
      </div>
      <p className="agent-page__subtitle">
        Paste structured data from Excel — LDA topics, N-gram velocity, and temporal evolution.
      </p>

      {/* ── NLP Stack ── */}
      <div className="hood-panel" style={{ marginBottom: 24 }}>
        <div className="hood-panel__header"><Cpu size={13} color="#1fe4c8" style={{ marginRight: 4 }} />NLP Stack</div>
        <div className="hood-panel__badges">{NLP_TECHNIQUES.map(t => <Badge key={t.label} {...t} />)}</div>
      </div>

      {/* ── Paste Input ── */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <label className="form-label" style={{ margin: 0 }}>
            <ClipboardPaste size={13} style={{ marginRight: 6, verticalAlign: 'middle', opacity: 0.7 }} />
            Paste from Excel / CSV / Pipe-separated
          </label>
          {hasData && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              color: '#1fe4c8', background: 'rgba(31,228,200,0.1)',
              border: '1px solid rgba(31,228,200,0.2)', borderRadius: 100, padding: '2px 10px',
            }}>
              {parsedRows.length} rows parsed
            </span>
          )}
        </div>
        <textarea
          className="glass-input" rows={8} value={pasteInput}
          onChange={handlePasteChange} spellCheck={false}
          placeholder={`Paste directly from Excel. Each row must start with a date:\n\n2024-06-25\tApple launches new AI-powered iPhone\n2024-07-02\tMicrosoft integrates Copilot into Office\n25/06/2024\tOpenAI releases GPT-5 preview\n\nSupports tab (Excel), comma (CSV), or pipe ( | ) separators.`}
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', lineHeight: 1.65, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {parseError && <StatusBanner type="error" message={parseError} />}
          {!parseError && hasSkips && <StatusBanner type="warning" message={`${skippedCount} row${skippedCount > 1 ? 's' : ''} skipped — unrecognized date format or missing text.`} />}
          {!parseError && hasData   && <StatusBanner type="success" message={`${parsedRows.length} row${parsedRows.length > 1 ? 's' : ''} ready for analysis.${hasSkips ? ` (${skippedCount} skipped)` : ''}`} />}
        </div>
      </div>

      {/* ── Preview Table ── */}
      {hasData && (
        <div className="glass-card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              <Table2 size={13} color="#4f8ef7" />Data Preview
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Click any cell to edit before analysis
            </span>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <PreviewTable rows={parsedRows} onEdit={handleEditRow} />
          </div>
        </div>
      )}

      {/* ── Config + Submit ── */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '0 0 180px', margin: 0 }}>
            <label className="form-label">Topic Count (LDA)</label>
            <input className="glass-input" type="number" min={2} max={20} value={numTopics} onChange={e => setNumTopics(e.target.value)} />
          </div>
          <button className="glass-btn glass-btn--teal" onClick={handleSubmit} disabled={!canSubmit} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading
              ? <><Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} />Analyzing…</>
              : <><TrendingUp size={16} />Run Trend Analysis</>
            }
          </button>
        </div>
      </div>

      {/* ── API Error ── */}
      {apiError && <div style={{ marginBottom: 16 }}><StatusBanner type="error" message={`API Error: ${apiError}`} /></div>}

      {/* ══════════════════════════════════════════════════════════════════════
          RESULTS — PDF capture target
      ══════════════════════════════════════════════════════════════════════ */}
      {result && (
        <div ref={reportRef} className="results-container">

          {/* Report metadata bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 4, paddingBottom: 14,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div>
              <div style={{ fontSize: '0.63rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 3 }}>
                Trend Intelligence Report
              </div>
              <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.18)' }}>
                {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })} · {parsedRows.length} documents
              </div>
            </div>
            <CopyBtn text={JSON.stringify(result, null, 2)} label="Full JSON" showFn={showToast} />
          </div>

          {/* ── AI Insight ── */}
          {aiNarrative && (
            <>
              <Divider label="Executive Intelligence" />
              <AIInsightCard narrative={aiNarrative} showFn={showToast} />
            </>
          )}

          {/* ── Charts ── */}
          {hasCharts && (
            <>
              <Divider label="Visual Analytics" />

              {/* Drift + Evolution */}
              {(driftData.length > 0 || evolutionData.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                  {driftData.length > 0 && (
                    <div className="glass-card" style={{ padding: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <Activity size={13} color="#1fe4c8" />
                        <span className="section-label" style={{ margin: 0 }}>Semantic Drift</span>
                      </div>
                      <SemanticDriftChart data={driftData} />
                    </div>
                  )}
                  {evolutionData.length > 0 && (
                    <div className="glass-card" style={{ padding: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <BarChart3 size={13} color="#4f8ef7" />
                        <span className="section-label" style={{ margin: 0 }}>Topic Evolution</span>
                      </div>
                      <TopicEvolutionChart data={evolutionData} />
                      <div style={{ display: 'flex', gap: 14, marginTop: 10, justifyContent: 'center' }}>
                        {[['#1fe4c8','Rising'],['#64748b','Stable'],['#f0894a','Declining']].map(([color, label]) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.35)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />{label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* N-gram velocity */}
              {ngramData.length > 0 && (
                <div className="glass-card" style={{ padding: 20, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Zap size={13} color="#7c5cbf" />
                      <span className="section-label" style={{ margin: 0 }}>N-gram Velocity</span>
                    </div>
                    <CopyBtn
                      text={ngramData.slice(0, 10).map(g => `${g.ngram}: ${g.velocity}`).join('\n')}
                      label="N-grams"
                      showFn={showToast}
                    />
                  </div>
                  <NgramVelocityChart data={ngramData} />
                  <div style={{ fontSize: '0.67rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.22)', marginTop: 8, textAlign: 'center' }}>
                    Blue = accelerating · Orange = decelerating
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Topics ── */}
          {actualTopics.length > 0 && (
            <>
              <Divider label="Latent Topic Clusters" />
              <div className="glass-card" style={{ padding: 22, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <span className="section-label">Latent Topics (LDA)</span>
                  <CopyBtn
                    text={actualTopics.map(t => `Topic ${t.topic_id}: ${(t.words ?? []).map(w => typeof w === 'string' ? w : w.word).join(', ')}`).join('\n')}
                    label="All Topics"
                    showFn={showToast}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {actualTopics.map((t, i) => (
                    <div key={i}
                      style={{
                        padding: 14, background: 'rgba(255,255,255,0.025)',
                        borderRadius: 10, border: `1px solid ${TOPIC_COLORS[i % 5]}30`,
                        transition: 'border-color 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = `${TOPIC_COLORS[i % 5]}55`}
                      onMouseLeave={e => e.currentTarget.style.borderColor = `${TOPIC_COLORS[i % 5]}30`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ color: TOPIC_COLORS[i % 5], fontWeight: 700, fontSize: '0.74rem', letterSpacing: '0.06em' }}>
                          TOPIC {t.topic_id ?? i + 1}
                        </div>
                        <CopyBtn
                          text={(t.words ?? []).map(w => typeof w === 'string' ? w : w.word).join(', ')}
                          label="Keywords"
                          showFn={showToast}
                        />
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(t.words ?? []).map((w, j) => (
                          <span key={j} style={{
                            padding: '3px 9px',
                            background: `${TOPIC_COLORS[i % 5]}10`,
                            border: `1px solid ${TOPIC_COLORS[i % 5]}1e`,
                            borderRadius: 5, fontSize: '0.73rem',
                            fontFamily: 'var(--font-mono)',
                            color: 'rgba(226,232,240,0.82)',
                          }}>
                            {typeof w === 'string' ? w : w.word}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Temporal detail ── */}
          {(evolutionData.length > 0 || driftData.length > 0) && (
            <>
              <Divider label="Temporal Intelligence" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                {evolutionData.length > 0 && (
                  <div className="glass-card" style={{ padding: 20 }}>
                    <span className="section-label">Topic Evolution Detail</span>
                    {evolutionData.map((e, i) => (
                      <div key={i} style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.55)' }}>Topic {e.topic_id}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: '0.69rem',
                            fontFamily: 'var(--font-mono)',
                            background: `${trendColor(e.trend)}16`,
                            color: trendColor(e.trend),
                            border: `1px solid ${trendColor(e.trend)}28`,
                          }}>
                            {e.trend.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>
                            {e.delta > 0 ? '+' : ''}{e.delta}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {driftData.length > 0 && (
                  <div className="glass-card" style={{ padding: 20 }}>
                    <span className="section-label">Semantic Drift Detail</span>
                    {driftData.map((t, i) => (
                      <div key={i} style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>{t.period}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 56, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (t.semantic_drift ?? 0) * 400)}%`, background: '#1fe4c8', borderRadius: 2 }} />
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>{t.semantic_drift}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Raw JSON ── */}
          <div className="glass-card" style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={() => setShowRaw(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Raw Response JSON
              </button>
              {showRaw && <CopyBtn text={JSON.stringify(result, null, 2)} label="Copy JSON" showFn={showToast} />}
            </div>
            {showRaw && (
              <pre className="json-block" style={{ marginTop: 12 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes toastIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}