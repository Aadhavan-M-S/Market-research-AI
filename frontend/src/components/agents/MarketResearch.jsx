import { useState, useCallback } from 'react'
import {
  Search, Cpu, AlertCircle, ChevronDown, ChevronUp,
  Tag, BarChart2, Zap, TrendingUp, Map, Layers,
  Download, Copy, Check,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Label,
} from 'recharts'
import { runMarketResearch } from '../../api/client.js'

/* ─────────────────────────────────────────────────────────────────────────────
   Copy-to-clipboard hook
────────────────────────────────────────────────────────────────────────────── */
function useCopy(timeout = 2000) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), timeout)
    })
  }, [timeout])
  return [copied, copy]
}

/* ─────────────────────────────────────────────────────────────────────────────
   CopyButton — floats top-right of any section
────────────────────────────────────────────────────────────────────────────── */
function CopyButton({ getText }) {
  const [copied, copy] = useCopy()
  const [tip, setTip] = useState(false)

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => copy(getText())}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            4,
          background:     copied
            ? 'rgba(31,228,200,0.14)'
            : 'rgba(255,255,255,0.05)',
          border:         copied
            ? '1px solid rgba(31,228,200,0.35)'
            : '1px solid rgba(255,255,255,0.1)',
          borderRadius:   6,
          cursor:         'pointer',
          padding:        '4px 9px',
          fontSize:       '0.7rem',
          fontFamily:     'var(--font-mono)',
          color:          copied ? '#1fe4c8' : 'var(--text-muted)',
          transition:     'all 0.18s ease',
          whiteSpace:     'nowrap',
        }}
      >
        {copied
          ? <><Check size={11} /><span>Copied</span></>
          : <><Copy size={11} /><span>Copy</span></>
        }
      </button>

      {tip && !copied && (
        <div style={{
          position:   'absolute',
          bottom:     'calc(100% + 6px)',
          right:      0,
          background: 'rgba(10,17,40,0.97)',
          border:     '1px solid rgba(79,142,247,0.25)',
          borderRadius: 6,
          padding:    '5px 10px',
          fontSize:   '0.7rem',
          color:      'var(--text-secondary)',
          whiteSpace: 'nowrap',
          zIndex:     100,
          pointerEvents: 'none',
          boxShadow:  '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          Copy to clipboard
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Text formatters (clean plain-text for clipboard)
────────────────────────────────────────────────────────────────────────────── */
const fmt = {
  summary: (r) =>
    `=== EXECUTIVE SUMMARY ===\n\n${r.summary}`,

  insights: (r) =>
    `=== STRATEGIC INSIGHTS ===\n\n` +
    r.insights.map((ins) => `• ${ins}`).join('\n'),

  entities: (r) =>
    `=== ENTITY LEADERBOARD ===\n\n` +
    r.entities.map((e, i) => `${i + 1}. ${e.name} (${e.count} mentions)`).join('\n'),

  clusters: (r) =>
    `=== THEME CLUSTERS ===\n\n` +
    r.clusters.map((c, i) => `[${i + 1}] ${c.label}\n${c.summary}`).join('\n\n'),

  positioning: (r) =>
    `=== COMPETITOR POSITIONING ===\n\n` +
    r.positioning
      .map(
        (p) =>
          `${p.name}  |  Ease of Use: ${(p.x * 100).toFixed(0)}%  |  Feature Richness: ${(p.y * 100).toFixed(0)}%`
      )
      .join('\n'),

  qa: (r) =>
    r.answers
      .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
      .join('\n\n'),

  full: (r) =>
    [
      fmt.summary(r),
      fmt.insights(r),
      fmt.entities(r),
      fmt.clusters(r),
      fmt.positioning(r),
      fmt.qa(r),
    ].join('\n\n---\n\n'),
}

/* ─────────────────────────────────────────────────────────────────────────────
   NLP technique badges (unchanged)
────────────────────────────────────────────────────────────────────────────── */
const NLP_TECHNIQUES = [
  { label: 'NER (CRF/LSTM)',           variant: 'nlp-badge',         desc: 'Named Entity Recognition — ORG & PRODUCT entities' },
  { label: 'Sentiment Classification', variant: 'nlp-badge--teal',   desc: 'DL-based polarity scoring on market text' },
  { label: 'Hybrid RAG',               variant: 'nlp-badge--purple', desc: 'Semantic + keyword retrieval fusion' },
  { label: 'Text Summarization',       variant: 'nlp-badge--warm',   desc: 'Extractive + abstractive compression' },
  { label: 'Embedding Clustering',     variant: 'nlp-badge--teal',   desc: 'K-Means theme detection over sentence embeddings' },
  { label: 'Source Weighting',         variant: 'nlp-badge',         desc: 'Length · recency · engagement scoring' },
  { label: 'Extractive QA',            variant: 'nlp-badge--purple', desc: 'Cross-encoder re-ranked span extraction' },
]

function NlpBadge({ label, variant, desc }) {
  const [tip, setTip] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <span
        className={`nlp-badge ${variant || ''}`}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        style={{ cursor: 'default' }}
      >
        <span className="nlp-badge-dot" />
        {label}
      </span>
      {tip && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)', background: 'rgba(10,17,40,0.97)',
          border: '1px solid rgba(79,142,247,0.25)', borderRadius: 8,
          padding: '7px 12px', fontSize: '0.72rem', color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', zIndex: 100, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {desc}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sentiment meter
────────────────────────────────────────────────────────────────────────────── */
function SentimentMeter({ score, label }) {
  if (score == null) return null
  const pct = Math.round(Math.min(Math.max((score + 1) / 2, 0), 1) * 100)
  const color = score > 0.2 ? '#1fe4c8' : score < -0.2 ? '#f08080' : '#8a96b0'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Overall Sentiment
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color, fontWeight: 600 }}>
          {label || (score > 0.2 ? 'Positive' : score < -0.2 ? 'Negative' : 'Neutral')} · {score?.toFixed(3)}
        </span>
      </div>
      <div className="score-bar">
        <div
          className="score-bar__fill"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
        />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Entity leaderboard
────────────────────────────────────────────────────────────────────────────── */
function EntityLeaderboard({ entities }) {
  if (!entities?.length) return null
  const max = entities[0]?.count || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entities.slice(0, 10).map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
            color: 'var(--text-muted)', width: 16, textAlign: 'right', flexShrink: 0,
          }}>
            {i + 1}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{
                fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {e.name}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8,
              }}>
                {e.count}×
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${(e.count / max) * 100}%`,
                background: i === 0
                  ? 'linear-gradient(90deg, #4f8ef7, #1fe4c8)'
                  : 'rgba(79,142,247,0.5)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Cluster cards
────────────────────────────────────────────────────────────────────────────── */
const CLUSTER_COLORS = ['#4f8ef7', '#1fe4c8', '#f0894a', '#9b76ef', '#5ee8d2']

function ClusterCards({ clusters }) {
  if (!clusters?.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {clusters.map((c, i) => (
        <div key={i} style={{
          padding: '14px 16px',
          background: `${CLUSTER_COLORS[i % CLUSTER_COLORS.length]}0d`,
          border: `1px solid ${CLUSTER_COLORS[i % CLUSTER_COLORS.length]}28`,
          borderRadius: 'var(--radius-sm)',
          borderLeft: `3px solid ${CLUSTER_COLORS[i % CLUSTER_COLORS.length]}`,
        }}>
          <div style={{
            fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
            color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
          }}>
            {c.label}
          </div>
          <p style={{ fontSize: '0.8rem', lineHeight: 1.55, color: 'var(--text-secondary)', margin: 0 }}>
            {c.summary}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Insight cards
────────────────────────────────────────────────────────────────────────────── */
function InsightCards({ insights }) {
  if (!insights?.length) return null
  const ICONS = ['📊', '🏆', '🗂️', '🔍', '⚠️', '🚀']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {insights.map((ins, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '12px 14px',
          background: 'rgba(31,228,200,0.04)',
          border: '1px solid rgba(31,228,200,0.12)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>
            {ICONS[i % ICONS.length]}
          </span>
          <span style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            {typeof ins === 'string' ? ins : JSON.stringify(ins)}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Chart tooltips
────────────────────────────────────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(10,17,40,0.95)', border: '1px solid rgba(79,142,247,0.3)',
      borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: 'var(--text-primary)',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', color: '#4f8ef7' }}>
        {payload[0].value}{payload[0].unit || ''}
      </div>
    </div>
  )
}

function PositioningTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'rgba(10,17,40,0.97)', border: '1px solid rgba(79,142,247,0.3)',
      borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Ease of Use: {(d.x * 100).toFixed(0)}%
      </div>
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Feature Richness: {(d.y * 100).toFixed(0)}%
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Section wrapper — now accepts a copyText prop
────────────────────────────────────────────────────────────────────────────── */
function Section({ icon: Icon, iconColor = '#1fe4c8', label, badge, copyText, children }) {
  return (
    <div className="glass-card" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Icon size={15} color={iconColor} />
        <span className="section-label" style={{ flex: 1 }}>{label}</span>
        {badge && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
            padding: '2px 7px',
            background: `${iconColor}18`,
            border: `1px solid ${iconColor}33`,
            borderRadius: 100, color: iconColor,
          }}>
            {badge}
          </span>
        )}
        {copyText && <CopyButton getText={() => copyText} />}
      </div>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Download Report button
────────────────────────────────────────────────────────────────────────────── */
function DownloadReportButton({ result }) {
  const [state, setState] = useState('idle') // idle | loading | error

  const handleDownload = async () => {
    setState('loading')
    try {
      const res = await fetch('/api/spectra/pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          query:       result.query,
          sources:     ['web', 'reddit'],
          max_results: 10,
        }),
      })

      if (!res.ok) throw new Error(`Server returned ${res.status}`)

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `spectra_${result.query.slice(0, 40).replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setState('idle')
    } catch (err) {
      console.error('PDF generation failed:', err)
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  const stateStyles = {
    idle: {
      background:  'linear-gradient(135deg, rgba(79,142,247,0.18), rgba(31,228,200,0.12))',
      border:      '1px solid rgba(79,142,247,0.35)',
      color:       '#4f8ef7',
    },
    loading: {
      background: 'rgba(79,142,247,0.08)',
      border:     '1px solid rgba(79,142,247,0.2)',
      color:      'var(--text-muted)',
    },
    error: {
      background: 'rgba(240,128,128,0.1)',
      border:     '1px solid rgba(240,128,128,0.3)',
      color:      '#f08080',
    },
  }

  return (
    <button
      onClick={handleDownload}
      disabled={state === 'loading'}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        padding:        '10px 20px',
        borderRadius:   9,
        cursor:         state === 'loading' ? 'wait' : 'pointer',
        fontSize:       '0.85rem',
        fontWeight:     600,
        fontFamily:     'var(--font-mono)',
        transition:     'all 0.2s ease',
        letterSpacing:  '0.02em',
        ...stateStyles[state],
      }}
    >
      {state === 'loading' ? (
        <>
          <div className="spinner" style={{ width: 14, height: 14 }} />
          Generating report…
        </>
      ) : state === 'error' ? (
        <>
          <AlertCircle size={14} />
          Generation failed
        </>
      ) : (
        <>
          <Download size={14} />
          Download Report
        </>
      )}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main component
────────────────────────────────────────────────────────────────────────────── */
export default function MarketResearch() {
  const [query,      setQuery]      = useState('')
  const [subreddits, setSubreddits] = useState('r/technology,r/business')
  const [maxResults, setMaxResults] = useState(10)
  const [includeWeb, setIncludeWeb] = useState(true)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)
  const [showRaw,    setShowRaw]    = useState(false)

  // Full-report copy
  const [fullCopied, copyFull] = useCopy()

  const handleSubmit = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const payload = {
        query:       query.trim(),
        sources:     [...(includeWeb ? ['web'] : []), ...(subreddits.trim() ? ['reddit'] : [])],
        max_results: Number(maxResults),
      }
      const data = await runMarketResearch(payload)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="agent-page">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11,
            background: 'rgba(31,228,200,0.12)',
            border: '1px solid rgba(31,228,200,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Search size={20} color="#1fe4c8" />
          </div>
          <h1 className="agent-page__title gradient-text">Spectra</h1>
        </div>
        <p className="agent-page__subtitle">
          AI-powered strategic market analysis — entity intelligence, theme clustering,
          competitor positioning, and McKinsey-style structured synthesis.
        </p>

        <div className="hood-panel">
          <div className="hood-panel__header">
            <Cpu className="hood-panel__header-icon" size={13} />
            Active Intelligence Layers
          </div>
          <div className="hood-panel__badges">
            {NLP_TECHNIQUES.map(t => <NlpBadge key={t.label} {...t} />)}
          </div>
        </div>
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: 24 }}>
        <div className="agent-form">
          <div className="form-group">
            <label className="form-label">Research Query</label>
            <input
              className="glass-input"
              placeholder="e.g. AI-powered CRM tools for SMBs in 2024"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Subreddits (comma-separated)</label>
              <input
                className="glass-input"
                placeholder="r/technology,r/business"
                value={subreddits}
                onChange={e => setSubreddits(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Max Results</label>
              <input
                className="glass-input" type="number" min={1} max={50}
                value={maxResults}
                onChange={e => setMaxResults(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setIncludeWeb(!includeWeb)}
              style={{
                width: 38, height: 22, borderRadius: 100,
                background: includeWeb
                  ? 'linear-gradient(90deg, #4f8ef7, #1fe4c8)'
                  : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
                transition: 'all var(--transition-smooth)', position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: includeWeb ? 19 : 3,
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                transition: 'left var(--transition-smooth)',
              }} />
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Include web search results
            </span>
          </div>

          <button
            className="glass-btn"
            onClick={handleSubmit}
            disabled={loading || !query.trim()}
            style={{ alignSelf: 'flex-start' }}
          >
            {loading ? (
              <>
                <div className="spinner" />
                <span>Analysing</span>
                <div className="thinking-dots" style={{ display: 'flex', gap: 3 }}>
                  <span /><span /><span />
                </div>
              </>
            ) : (
              <>
                <Search size={15} />
                Run Spectra
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 20 }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Agent Error</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {result && (
        <div className="results-container">

          {/* ── Actions bar (Download + Copy All) ──────────────────────── */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            gap:            12,
            padding:        '14px 20px',
            background:     'rgba(79,142,247,0.04)',
            border:         '1px solid rgba(79,142,247,0.15)',
            borderRadius:   'var(--radius-sm)',
            flexWrap:       'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Report ready
              </span>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#1fe4c8',
                boxShadow:  '0 0 6px #1fe4c8',
                display:    'inline-block',
              }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Copy full report */}
              <button
                onClick={() => copyFull(fmt.full(result))}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         6,
                  padding:     '8px 16px',
                  borderRadius: 8,
                  background:  fullCopied
                    ? 'rgba(31,228,200,0.12)'
                    : 'rgba(255,255,255,0.05)',
                  border:      fullCopied
                    ? '1px solid rgba(31,228,200,0.3)'
                    : '1px solid rgba(255,255,255,0.1)',
                  cursor:      'pointer',
                  fontSize:    '0.8rem',
                  fontFamily:  'var(--font-mono)',
                  color:       fullCopied ? '#1fe4c8' : 'var(--text-muted)',
                  transition:  'all 0.18s ease',
                }}
              >
                {fullCopied
                  ? <><Check size={12} />Copied</>
                  : <><Copy size={12} />Copy All</>
                }
              </button>

              {/* Download PDF */}
              <DownloadReportButton result={result} />
            </div>
          </div>

          {/* Executive Summary */}
          {result.summary && (
            <Section
              icon={BarChart2} iconColor="#1fe4c8"
              label="Executive Briefing" badge="LLM Synthesis"
              copyText={fmt.summary(result)}
            >
              <p style={{ fontSize: '0.92rem', lineHeight: 1.75, color: 'var(--text-primary)', margin: 0 }}>
                {result.summary}
              </p>
            </Section>
          )}

          {/* Sentiment */}
          {result.sentiment && (
            <Section icon={BarChart2} iconColor="#f0894a" label="Sentiment Analysis">
              <SentimentMeter score={result.sentiment_score} label={result.sentiment?.overall} />
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={[
                    { name: 'Positive', value: result.sentiment.positive, fill: '#1fe4c8' },
                    { name: 'Negative', value: result.sentiment.negative, fill: '#f08080' },
                    { name: 'Neutral',  value: result.sentiment.neutral,  fill: '#8a96b0' },
                  ]}
                  margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {[
                      { fill: '#1fe4c8' },
                      { fill: '#f08080' },
                      { fill: '#8a96b0' },
                    ].map((entry, i) => (
                      <rect key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          )}

          {/* Key Insights */}
          {result.insights?.length > 0 && (
            <Section
              icon={Zap} iconColor="#1fe4c8"
              label="Strategic Insights"
              copyText={fmt.insights(result)}
            >
              <InsightCards insights={result.insights} />
            </Section>
          )}

          {/* Entity Leaderboard */}
          {result.entities?.length > 0 && (
            <Section
              icon={Tag} iconColor="#4f8ef7"
              label="Entity Leaderboard" badge="NER · ORG / PRODUCT"
              copyText={fmt.entities(result)}
            >
              <EntityLeaderboard entities={result.entities} />
            </Section>
          )}

          {/* Trend Chart */}
          {result.trends?.length > 0 && (
            <Section icon={TrendingUp} iconColor="#f0894a" label="Mention Trends" badge="Frequency Analysis">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={result.trends}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    type="category" dataKey="name" width={90}
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="value" fill="url(#trendGrad)" radius={[0, 4, 4, 0]}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#4f8ef7" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#1fe4c8" />
                      </linearGradient>
                    </defs>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          )}

          {/* Theme Clusters */}
          {result.clusters?.length > 0 && (
            <Section
              icon={Layers} iconColor="#9b76ef"
              label="Theme Clusters" badge="Embedding Clustering"
              copyText={fmt.clusters(result)}
            >
              <ClusterCards clusters={result.clusters} />
            </Section>
          )}

          {/* Competitor Positioning Map */}
          {result.positioning?.length > 0 && (
            <Section
              icon={Map} iconColor="#5ee8d2"
              label="Competitor Positioning Map" badge="2D Proxy Analysis"
              copyText={fmt.positioning(result)}
            >
              <div style={{ marginBottom: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                X-axis: Ease of Use (positive sentiment proxy) · Y-axis: Feature Richness (mention density proxy)
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    type="number" dataKey="x" domain={[0, 1]} name="Ease of Use"
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false}
                  >
                    <Label value="Ease of Use →" offset={-5} position="insideBottom" fill="var(--text-muted)" fontSize={11} />
                  </XAxis>
                  <YAxis
                    type="number" dataKey="y" domain={[0, 1]} name="Feature Richness"
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false}
                  >
                    <Label value="Feature Richness →" angle={-90} position="insideLeft" fill="var(--text-muted)" fontSize={11} />
                  </YAxis>
                  <ZAxis range={[60, 60]} />
                  <ReferenceLine x={0.5} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                  <ReferenceLine y={0.5} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                  <Tooltip content={<PositioningTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter
                    data={result.positioning}
                    fill="#4f8ef7"
                    fillOpacity={0.85}
                    label={({ name, cx, cy }) => (
                      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
                        {name}
                      </text>
                    )}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </Section>
          )}

          {/* QA Answers */}
          {result.answers?.length > 0 && (
            <Section
              icon={Search} iconColor="#4f8ef7"
              label="Extractive QA"
              copyText={fmt.qa(result)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.answers.map((a, i) => (
                  <div key={i}>
                    <div style={{
                      fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                      color: '#4f8ef7', marginBottom: 4,
                    }}>
                      Q: {a.question}
                    </div>
                    <p style={{
                      fontSize: '0.875rem', lineHeight: 1.65,
                      color: 'var(--text-primary)', margin: 0,
                    }}>
                      {a.answer}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Sources */}
          {result.sources?.length > 0 && (
            <Section icon={BarChart2} iconColor="#4f8ef7" label={`Sources (${result.sources.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                      color: 'var(--text-accent)', textDecoration: 'none',
                      padding: '6px 10px',
                      background: 'rgba(79,142,247,0.06)',
                      borderRadius: 6, border: '1px solid rgba(79,142,247,0.12)',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(79,142,247,0.12)'
                      e.currentTarget.style.borderColor = 'rgba(79,142,247,0.3)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(79,142,247,0.06)'
                      e.currentTarget.style.borderColor = 'rgba(79,142,247,0.12)'
                    }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof src === 'string' ? src : (src.title || src.url)}
                    </span>
                    {src.weight != null && (
                      <span style={{
                        flexShrink: 0, fontSize: '0.65rem',
                        padding: '2px 6px', borderRadius: 100,
                        background: 'rgba(31,228,200,0.1)',
                        border: '1px solid rgba(31,228,200,0.2)',
                        color: '#5ee8d2',
                      }}>
                        {(src.weight * 100).toFixed(0)}pts
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Processing meta */}
          {result.nlp_meta && (
            <Section icon={Cpu} iconColor="var(--text-muted)" label="Processing Intelligence">
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                <span>⏱ {result.nlp_meta.processing_time}s total</span>
                <span>🧠 {result.nlp_meta.models_used?.join(', ')}</span>
              </div>
              {result.nlp_meta.timing_breakdown && (
                <div style={{
                  marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '4px 16px',
                  fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                }}>
                  {Object.entries(result.nlp_meta.timing_breakdown).map(([k, v]) => (
                    <span key={k}>{k}: {v}s</span>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Raw JSON toggle */}
          <div className="glass-card" style={{ padding: '14px 20px' }}>
            <button
              onClick={() => setShowRaw(!showRaw)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem', width: '100%',
              }}
            >
              {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Raw Response JSON
            </button>
            {showRaw && (
              <pre className="json-block" style={{ marginTop: 12 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>

        </div>
      )}
    </div>
  )
}