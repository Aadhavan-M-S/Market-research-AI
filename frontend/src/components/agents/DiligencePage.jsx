import { useState, useCallback, useRef } from 'react'
import { runDiligenceAnalysis } from '../../api/client.js'

/* ─────────────────────────────────────────────────────────────────────────────
   Design tokens — investment-grade dark aesthetic (obsidian + amber + signal)
───────────────────────────────────────────────────────────────────────────── */
const T = {
  bg:       '#07090c',
  surface:  '#0c0f14',
  panel:    '#0f1219',
  card:     '#111620',
  cardHi:   '#141a24',
  border:   '#1a2030',
  borderHi: '#253045',

  gold:    '#c8912a',
  goldDim: 'rgba(200,145,42,0.09)',
  teal:    '#22d4b8',
  tealDim: 'rgba(34,212,184,0.07)',
  blue:    '#4f90f5',
  blueDim: 'rgba(79,144,245,0.07)',

  critical: '#e05060',
  high:     '#e07850',
  medium:   '#d4a838',
  low:      '#3fb87a',

  criticalBg: 'rgba(224,80,96,0.06)',
  highBg:     'rgba(224,120,80,0.06)',
  mediumBg:   'rgba(212,168,56,0.06)',
  lowBg:      'rgba(63,184,122,0.06)',

  t1: '#dde4f0',
  t2: '#7a84a0',
  t3: '#3e4560',
  t4: '#1e2535',

  fontMono:    "'JetBrains Mono', 'Fira Code', monospace",
  fontDisplay: "'Syne', 'DM Sans', sans-serif",
}

const SEV = {
  CRITICAL: { color: T.critical, bg: T.criticalBg, border: 'rgba(224,80,96,0.2)',  dot: '🔴', order: 0 },
  HIGH:     { color: T.high,     bg: T.highBg,     border: 'rgba(224,120,80,0.2)', dot: '🟠', order: 1 },
  MEDIUM:   { color: T.medium,   bg: T.mediumBg,   border: 'rgba(212,168,56,0.2)', dot: '🟡', order: 2 },
  LOW:      { color: T.low,      bg: T.lowBg,      border: 'rgba(63,184,122,0.2)', dot: '🟢', order: 3 },
}
const getSev = s => SEV[(s || 'MEDIUM').toUpperCase()] || SEV.MEDIUM

const VERDICT_META = {
  Proceed: { color: T.low,      bg: 'rgba(63,184,122,0.08)',  icon: '✅', label: 'PROCEED' },
  Caution: { color: T.medium,   bg: 'rgba(212,168,56,0.08)',  icon: '⚠️', label: 'CAUTION' },
  Decline: { color: T.critical, bg: 'rgba(224,80,96,0.08)',   icon: '🚫', label: 'DECLINE' },
}
const getVerdict = v => VERDICT_META[v] || VERDICT_META.Caution

/* ─────────────────────────────────────────────────────────────────────────────
   [FIX-19] Frontend response normalization layer
   Guarantees the UI never encounters undefined/null for any field it renders.
   Applied once on API response before setResult — downstream components are safe.
───────────────────────────────────────────────────────────────────────────── */
const SEVERITY_SORT_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      summary: 'No analysis data returned.',
      financial_highlights: [],
      extracted_entities: {},
      ner_entities: [],
      risks: [],
      verdict: 'Caution',
      verdict_reasoning: '',
      worst_case_scenario: 'Unable to assess.',
      rag_context: [],
      confidence_score: 0,
      risk_counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      processing_time_ms: 0,
    }
  }

  // [FIX-21] Enforce client-side risk sort by severity — never trust backend ordering
  const risks = Array.isArray(raw.risks)
    ? [...raw.risks].sort(
        (a, b) =>
          (SEVERITY_SORT_ORDER[(a.severity || 'MEDIUM').toUpperCase()] ?? 2) -
          (SEVERITY_SORT_ORDER[(b.severity || 'MEDIUM').toUpperCase()] ?? 2)
      )
    : []

  return {
    summary:             typeof raw.summary === 'string' ? raw.summary : 'No summary available.',
    // [FIX-19] financial_highlights: never undefined, never empty without fallback
    financial_highlights: Array.isArray(raw.financial_highlights) && raw.financial_highlights.length > 0
      ? raw.financial_highlights
      : [],
    extracted_entities:  raw.extracted_entities && typeof raw.extracted_entities === 'object'
      ? raw.extracted_entities
      : {},
    ner_entities:        Array.isArray(raw.ner_entities) ? raw.ner_entities : [],
    risks,
    // [FIX-19/FIX-3] verdict always a valid string
    verdict:             typeof raw.verdict === 'string' && raw.verdict.trim()
      ? raw.verdict.trim()
      : 'Caution',
    verdict_reasoning:   typeof raw.verdict_reasoning === 'string' ? raw.verdict_reasoning : '',
    // [FIX-20] worst_case_scenario validated with trim — empty string treated as missing
    worst_case_scenario: typeof raw.worst_case_scenario === 'string' && raw.worst_case_scenario.trim()
      ? raw.worst_case_scenario.trim()
      : '',
    rag_context:         Array.isArray(raw.rag_context) ? raw.rag_context : [],
    confidence_score:    typeof raw.confidence_score === 'number' ? raw.confidence_score : 0,
    risk_counts:         raw.risk_counts && typeof raw.risk_counts === 'object'
      ? raw.risk_counts
      : { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    processing_time_ms:  typeof raw.processing_time_ms === 'number' ? raw.processing_time_ms : 0,
  }
}

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
      * { box-sizing: border-box; }
      @keyframes spin  { to { transform: rotate(360deg); } }
      @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
      @keyframes fadeUp{
        from{opacity:0;transform:translateY(10px)}
        to{opacity:1;transform:translateY(0)}
      }
      .fade-up { animation: fadeUp 0.35s ease both; }
      textarea:focus { outline: none; border-color: ${T.gold}50 !important; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
    `}</style>
  )
}

/* ── Micro-utilities ─────────────────────────────────────────────────────────── */
function useCopy(text, ms = 1800) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), ms)
    })
  }, [text, ms])
  return [copied, copy]
}

function CopyBtn({ text, label = 'Copy', accent }) {
  const [copied, copy] = useCopy(text)
  const col = accent || T.t2
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 5,
      background: copied ? `${T.teal}12` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${copied ? `${T.teal}35` : T.border}`,
      color: copied ? T.teal : col,
      fontFamily: T.fontMono, fontSize: '0.65rem', cursor: 'pointer',
      transition: 'all 0.18s', whiteSpace: 'nowrap',
    }}>
      {copied ? '✓ Copied' : label}
    </button>
  )
}

function Chip({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: `${color}16`, border: `1px solid ${color}38`,
      color, fontFamily: T.fontMono, fontSize: '0.61rem', letterSpacing: '0.05em',
    }}>{label}</span>
  )
}

function SectionLabel({ children, accent }) {
  return (
    <div style={{
      fontFamily: T.fontMono, fontSize: '0.61rem', fontWeight: 700,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: accent || T.t2, marginBottom: 14,
    }}>{children}</div>
  )
}

function Card({ children, style = {}, className = '' }) {
  return (
    <div className={className} style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: '18px 20px', ...style,
    }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: T.border, margin: '12px 0', opacity: 0.6 }} />
}

/* ── Verdict Banner ────────────────────────────────────────────────────────── */
function VerdictBanner({ verdict, reasoning }) {
  const m = getVerdict(verdict)
  return (
    <div className="fade-up" style={{
      padding: '16px 20px', borderRadius: 10,
      background: m.bg, border: `1px solid ${m.color}35`,
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <div style={{
        minWidth: 90, padding: '5px 10px', borderRadius: 6, textAlign: 'center',
        background: `${m.color}18`, border: `1px solid ${m.color}40`,
        fontFamily: T.fontMono, fontSize: '0.7rem', fontWeight: 800,
        color: m.color, letterSpacing: '0.1em',
      }}>
        {m.icon} {m.label}
      </div>
      <div>
        <div style={{ fontFamily: T.fontDisplay, fontSize: '0.78rem', fontWeight: 600, color: T.t1, marginBottom: 4 }}>
          Investment Verdict
        </div>
        {reasoning && (
          <div style={{ fontFamily: T.fontMono, fontSize: '0.74rem', color: T.t2, lineHeight: 1.6 }}>
            {reasoning}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Risk Count Summary ────────────────────────────────────────────────────── */
function RiskSummaryBar({ riskCounts }) {
  const total = Object.values(riskCounts).reduce((a, b) => a + b, 0)
  if (!total) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 16px', borderRadius: 9,
      background: T.panel, border: `1px solid ${T.border}`,
    }}>
      <span style={{ fontFamily: T.fontMono, fontSize: '0.65rem', color: T.t2, marginRight: 4, letterSpacing: '0.1em' }}>
        RISK SUMMARY
      </span>
      {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => {
        const meta = SEV[s]
        const count = riskCounts[s] || 0
        if (!count) return null
        return (
          <span key={s} style={{
            padding: '2px 9px', borderRadius: 4,
            background: `${meta.color}16`, border: `1px solid ${meta.color}35`,
            fontFamily: T.fontMono, fontSize: '0.62rem', fontWeight: 700,
            color: meta.color, letterSpacing: '0.06em',
          }}>
            {count} {s}
          </span>
        )
      })}
    </div>
  )
}

/* ── Top 3 Critical Risks ──────────────────────────────────────────────────── */
function TopRisksPanel({ risks }) {
  const top = risks.slice(0, 3)
  if (!top.length) return null
  return (
    <Card className="fade-up">
      <SectionLabel accent={T.critical}>⚡ Top Risk Factors</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top.map((r, i) => {
          const sev = getSev(r.severity)
          return (
            <div key={i} style={{
              padding: '11px 14px', borderRadius: 8,
              background: sev.bg, border: `1px solid ${sev.border}`,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <div style={{
                minWidth: 24, height: 24, borderRadius: '50%',
                background: `${sev.color}20`, border: `1px solid ${sev.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: T.fontMono, fontSize: '0.65rem', fontWeight: 800, color: sev.color,
              }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.fontDisplay, fontSize: '0.87rem', fontWeight: 700, color: T.t1, marginBottom: 2 }}>
                  {r.risk}
                </div>
                {r.category && (
                  <Chip label={r.category} color={sev.color} />
                )}
                {r.impact && (
                  <div style={{ fontFamily: T.fontMono, fontSize: '0.72rem', color: T.t2, marginTop: 6, lineHeight: 1.5 }}>
                    <span style={{ color: T.t3 }}>Impact: </span>{r.impact}
                  </div>
                )}
              </div>
              <div style={{
                padding: '3px 8px', borderRadius: 4, height: 'fit-content',
                background: `${sev.color}18`, border: `1px solid ${sev.color}40`,
                fontFamily: T.fontMono, fontSize: '0.59rem', fontWeight: 800,
                color: sev.color, letterSpacing: '0.08em', whiteSpace: 'nowrap',
              }}>
                {(r.severity || 'MEDIUM').toUpperCase()}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ── Full Risk Card ────────────────────────────────────────────────────────── */
function RiskCard({ risk, i }) {
  const [expanded, setExpanded] = useState(false)
  const sev = getSev(risk.severity)
  const copyText = [
    `[${risk.severity}] ${risk.risk}`,
    risk.category && `Category: ${risk.category}`,
    risk.evidence && `Evidence: ${risk.evidence}`,
    risk.impact && `Impact: ${risk.impact}`,
    risk.recommendation && `Recommendation: ${risk.recommendation}`,
  ].filter(Boolean).join('\n')

  return (
    <div style={{
      borderRadius: 9, overflow: 'hidden',
      border: `1px solid ${sev.border}`,
      background: sev.bg, marginBottom: 8,
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '11px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <div style={{
          minWidth: 72, padding: '3px 8px', borderRadius: 5, textAlign: 'center',
          background: `${sev.color}18`, border: `1px solid ${sev.color}40`,
          fontFamily: T.fontMono, fontSize: '0.59rem', fontWeight: 800,
          color: sev.color, letterSpacing: '0.08em',
        }}>
          {(risk.severity || 'MEDIUM').toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: '0.87rem', fontWeight: 600, color: T.t1 }}>
            {risk.risk || `Risk ${i + 1}`}
          </span>
          {risk.category && (
            <span style={{
              marginLeft: 8, padding: '1px 6px', borderRadius: 3,
              background: `${sev.color}14`, border: `1px solid ${sev.color}30`,
              fontFamily: T.fontMono, fontSize: '0.58rem', color: sev.color,
            }}>{risk.category}</span>
          )}
        </div>
        <span style={{ fontFamily: T.fontMono, fontSize: '0.7rem', color: T.t3, userSelect: 'none' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 14px 14px 14px', borderTop: `1px solid ${sev.border}` }}>
          {risk.evidence && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.59rem', color: T.t3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                Evidence
              </div>
              <div style={{
                fontFamily: T.fontMono, fontSize: '0.74rem', color: T.t2,
                padding: '8px 12px', borderRadius: 6,
                background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`,
                lineHeight: 1.55, borderLeft: `3px solid ${sev.color}60`,
              }}>
                {risk.evidence}
              </div>
            </div>
          )}
          {risk.impact && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.59rem', color: T.t3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                Impact
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.74rem', color: T.t2, lineHeight: 1.55 }}>
                {risk.impact}
              </div>
            </div>
          )}
          {risk.recommendation && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.59rem', color: T.t3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                Recommendation
              </div>
              <div style={{
                fontFamily: T.fontMono, fontSize: '0.74rem', color: T.teal,
                lineHeight: 1.55,
              }}>
                → {risk.recommendation}
              </div>
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <CopyBtn text={copyText} label="Copy Risk" />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Risk Group (by severity) ──────────────────────────────────────────────── */
function RiskGroup({ severityKey, risks }) {
  const sev = SEV[severityKey]
  // [FIX-21] Risks already sorted at normalization, filter only
  const sevRisks = risks.filter(r => (r.severity || 'MEDIUM').toUpperCase() === severityKey)
  if (!sevRisks.length) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        padding: '6px 12px', borderRadius: 6,
        background: `${sev.color}10`, border: `1px solid ${sev.color}25`,
        width: 'fit-content',
      }}>
        <span>{sev.dot}</span>
        <span style={{ fontFamily: T.fontMono, fontSize: '0.64rem', fontWeight: 700, color: sev.color, letterSpacing: '0.1em' }}>
          {severityKey}
        </span>
        <span style={{
          padding: '1px 6px', borderRadius: 3,
          background: `${sev.color}18`, border: `1px solid ${sev.color}35`,
          fontFamily: T.fontMono, fontSize: '0.6rem', color: sev.color,
        }}>{sevRisks.length}</span>
      </div>
      {sevRisks.map((r, i) => <RiskCard key={i} risk={r} i={i} />)}
    </div>
  )
}

/* ── Financial Entity Panel ────────────────────────────────────────────────── */
function FinancialGroup({ label, items, color }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: T.fontMono, fontSize: '0.59rem', color: T.t2,
        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
      }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {items.map((item, i) => <Chip key={i} label={item} color={color} />)}
      </div>
    </div>
  )
}

/* ── Confidence Bar ────────────────────────────────────────────────────────── */
function ConfidenceBar({ score }) {
  const pct = Math.round((score || 0) * 100)
  const col = pct >= 70 ? T.low : pct >= 40 ? T.medium : T.critical
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t2, whiteSpace: 'nowrap' }}>
        Extraction confidence
      </div>
      <div style={{
        flex: 1, height: 4, background: T.border, borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: col, borderRadius: 2,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: '0.65rem', color: col, minWidth: 32 }}>
        {pct}%
      </div>
    </div>
  )
}

/* ── Worst Case Panel ──────────────────────────────────────────────────────── */
function WorstCasePanel({ text }) {
  // [FIX-20] Validate with trim — empty/whitespace-only strings don't render the panel
  if (!text || !text.trim()) return null
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 9,
      background: 'rgba(224,80,96,0.04)', border: '1px solid rgba(224,80,96,0.18)',
    }}>
      <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.critical, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
        ⚠ Worst-Case Scenario
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: '0.75rem', color: T.t2, lineHeight: 1.6 }}>
        {text}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Main DiligencePage
═══════════════════════════════════════════════════════════════════════════════ */
export default function DiligencePage() {
  const [file,    setFile]    = useState(null)
  const [query,   setQuery]   = useState('Identify key financial risks, obligations, and red flags.')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')
  const fileRef = useRef(null)

  const handleAnalyze = useCallback(async () => {
    if (!file) { setError('Please upload a PDF document.'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('query', query || 'Identify key financial risks')
      const raw = await runDiligenceAnalysis(fd)
      // [FIX-19] Apply normalization layer — safe defaults for every field
      setResult(normalizeResult(raw))
    } catch (e) {
      setError(e.message || 'Analysis failed. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [file, query])

  /* Build export report — [FIX-22] fully defensive, no undefined values */
  const buildExport = () => {
    if (!result) return ''
    const hr = '─'.repeat(60)

    const risks = (result.risks || [])
      .map(r => [
        `  [${(r.severity || 'MEDIUM').toUpperCase()}] ${r.risk || 'Unknown risk'}`,
        r.category     && `  Category: ${r.category}`,
        r.evidence     && `  Evidence: ${r.evidence}`,
        r.impact       && `  Impact: ${r.impact}`,
        r.recommendation && `  Recommendation: ${r.recommendation}`,
      ].filter(Boolean).join('\n'))
      .join('\n\n')

    const fin = result.extracted_entities || {}
    const finLines = [
      fin.revenue?.length     && `  Revenue: ${fin.revenue.join(', ')}`,
      fin.debt?.length        && `  Debt: ${fin.debt.join(', ')}`,
      fin.liabilities?.length && `  Liabilities: ${fin.liabilities.join(', ')}`,
      fin.costs?.length       && `  Costs: ${fin.costs.join(', ')}`,
    ].filter(Boolean).join('\n')

    // [FIX-22] verdict safe — normalizeResult guarantees it's a non-empty string
    const verdictLabel = (result.verdict || 'Caution').toUpperCase()

    return [
  'DUE DILIGENCE ANALYSIS REPORT',
  hr,
  '',

  'EXECUTIVE SUMMARY',
  result.summary || 'No summary available.',
  '',

  'FINANCIAL HIGHLIGHTS',
  result.financial_highlights && result.financial_highlights.length > 0
    ? result.financial_highlights.map(h => `  • ${h}`).join('\n')
    : '  No financial highlights extracted.',
  '',

  'FINANCIAL ENTITIES',
  finLines || '  None extracted.',
  '',

  `VERDICT: ${verdictLabel}`,
  result.verdict_reasoning || '',
  '',

  'IDENTIFIED RISKS',
  risks || '  None identified.',
  '',

  ...(result.worst_case_scenario && result.worst_case_scenario.trim()
    ? [
        'WORST-CASE SCENARIO',
        result.worst_case_scenario,
        '',
      ]
    : []),

  `Confidence Score: ${Math.round((result.confidence_score ?? 0) * 100)}%`,
].join('\n')
  }

  return (
    <div style={{
      background: T.bg, minHeight: '100vh',
      padding: '28px 24px', fontFamily: T.fontDisplay, color: T.t1,
    }}>
      <FontLoader />

      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'linear-gradient(135deg, #c8912a 0%, #e07050 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem',
            }}>📋</div>
            <h1 style={{
              fontFamily: T.fontDisplay, fontWeight: 800, fontSize: '1.4rem',
              letterSpacing: '-0.03em', color: T.t1, margin: 0,
            }}>Due Diligence Analyzer</h1>
          </div>
          <p style={{ fontFamily: T.fontMono, fontSize: '0.71rem', color: T.t2, margin: 0 }}>
            Investment-grade risk extraction · Evidence-backed analysis · Structured output
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, maxWidth: 1260 }}>

        {/* ── Left: Input ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <SectionLabel accent={T.gold}>Document Upload</SectionLabel>
            {/* Drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${file ? T.gold + '55' : T.borderHi}`,
                borderRadius: 9, padding: '20px 14px', textAlign: 'center',
                cursor: 'pointer', marginBottom: 14,
                background: file ? T.goldDim : T.surface,
                transition: 'all 0.2s',
              }}
            >
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
                onChange={e => { setFile(e.target.files[0]); setResult(null) }} />
              <div style={{ fontSize: '1.8rem', marginBottom: 5 }}>
                {file ? '📄' : '⬆️'}
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.75rem', color: file ? T.gold : T.t2 }}>
                {file ? file.name : 'Click to select PDF'}
              </div>
              {file && (
                <div style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3, marginTop: 3 }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              )}
            </div>

            <SectionLabel>Analyst Query</SectionLabel>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              rows={3}
              style={{
                width: '100%', resize: 'vertical',
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 7, padding: '9px 12px', marginBottom: 14,
                fontFamily: T.fontMono, fontSize: '0.76rem', color: T.t1,
                lineHeight: 1.6, transition: 'border-color 0.2s',
              }}
            />

            <button
              onClick={handleAnalyze}
              disabled={loading || !file}
              style={{
                width: '100%', padding: '11px', borderRadius: 8,
                background: loading ? T.t4 : T.goldDim,
                border: `1px solid ${loading ? T.border : T.gold + '45'}`,
                color: loading ? T.t2 : T.gold,
                fontFamily: T.fontMono, fontSize: '0.8rem', fontWeight: 700,
                cursor: (loading || !file) ? 'not-allowed' : 'pointer',
                letterSpacing: '0.05em', transition: 'all 0.2s',
              }}
            >
              {loading ? 'Analyzing…' : 'Run Due Diligence →'}
            </button>

            {error && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 7,
                background: 'rgba(224,80,96,0.05)', border: '1px solid rgba(224,80,96,0.2)',
                fontFamily: T.fontMono, fontSize: '0.71rem', color: T.critical,
              }}>{error}</div>
            )}
          </Card>

          {/* Meta panel */}
          {result && (
            <div style={{
              padding: '10px 14px', background: T.panel,
              border: `1px solid ${T.border}`, borderRadius: 9,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <ConfidenceBar score={result.confidence_score} />
              <div style={{ fontFamily: T.fontMono, fontSize: '0.67rem', color: T.t3 }}>
                ⏱ {result.processing_time_ms?.toFixed(0)}ms processing time
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Results ── */}
        <div>
          {/* Empty state */}
          {!result && !loading && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: 420, gap: 10, opacity: 0.35,
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
            }}>
              <div style={{ fontSize: '2.8rem' }}>📋</div>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.77rem', color: T.t2, textAlign: 'center' }}>
                Upload a PDF to begin due diligence analysis
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: 420, gap: 16,
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                border: `3px solid ${T.border}`, borderTopColor: T.gold,
                animation: 'spin 0.85s linear infinite',
              }} />
              <div style={{ fontFamily: T.fontMono, fontSize: '0.76rem', color: T.t2, textAlign: 'center', lineHeight: 1.8 }}>
                Extracting entities &amp; analyzing risks…
                <br />
                <span style={{ fontSize: '0.65rem', color: T.t3 }}>Multi-chunk LLM analysis in progress</span>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Export row */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                <CopyBtn text={result.summary} label="Copy Summary" accent={T.t2} />
                <CopyBtn text={buildExport()} label="Export Full Report" accent={T.gold} />
              </div>

              {/* Risk count bar */}
              {result.risk_counts && <RiskSummaryBar riskCounts={result.risk_counts} />}

              {/* Verdict — always present post-normalization */}
              <VerdictBanner verdict={result.verdict} reasoning={result.verdict_reasoning} />

              {/* Executive Summary */}
              <Card className="fade-up">
                <SectionLabel accent={T.gold}>Executive Summary</SectionLabel>
                <div style={{
                  fontFamily: T.fontDisplay, fontSize: '0.9rem', color: T.t1,
                  lineHeight: 1.8, whiteSpace: 'pre-wrap',
                }}>
                  {result.summary}
                </div>

                {/* Financial highlights — only shown when non-empty (normalization ensures array) */}
                {result.financial_highlights.length > 0 && (
                  <>
                    <Divider />
                    <SectionLabel accent={T.teal}>Financial Highlights</SectionLabel>
                    <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'none' }}>
                      {result.financial_highlights.map((h, i) => (
                        <li key={i} style={{
                          fontFamily: T.fontMono, fontSize: '0.75rem', color: T.t2,
                          padding: '3px 0', lineHeight: 1.55,
                          display: 'flex', gap: 8, alignItems: 'flex-start',
                        }}>
                          <span style={{ color: T.teal, marginTop: 1 }}>›</span>
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>

              {/* Top 3 risks */}
              {result.risks.length > 0 && <TopRisksPanel risks={result.risks} />}

              {/* [FIX-20] Worst case — trim-validated in normalizeResult and WorstCasePanel */}
              <WorstCasePanel text={result.worst_case_scenario} />

              {/* All risks, grouped by severity */}
              {result.risks.length > 0 && (
                <Card className="fade-up">
                  <SectionLabel accent={T.critical}>Identified Risks ({result.risks.length})</SectionLabel>
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => (
                    <RiskGroup key={s} severityKey={s} risks={result.risks} />
                  ))}
                </Card>
              )}

              {/* Structured financial entities */}
              {result.extracted_entities && (
                <Card className="fade-up">
                  <SectionLabel accent={T.gold}>Financial Entities</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <FinancialGroup label="Revenue"     items={result.extracted_entities.revenue}     color={T.low}    />
                    <FinancialGroup label="Debt"        items={result.extracted_entities.debt}         color={T.critical}/>
                    <FinancialGroup label="Liabilities" items={result.extracted_entities.liabilities}  color={T.high}   />
                    <FinancialGroup label="Costs"       items={result.extracted_entities.costs}         color={T.medium} />
                    <FinancialGroup label="Percentages" items={result.extracted_entities.percentages}   color={T.teal}   />
                    <FinancialGroup label="Key Dates"   items={result.extracted_entities.dates}         color={T.blue}   />
                  </div>
                </Card>
              )}

              {/* NER entities */}
              {result.ner_entities.length > 0 && (
                <Card className="fade-up">
                  <SectionLabel accent={T.blue}>Named Entities</SectionLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {result.ner_entities.map((e, i) => {
                      const cols = { ORG: T.blue, PERSON: T.teal, GPE: T.gold, MONEY: T.low, DATE: T.t2, LAW: T.critical }
                      const col = cols[e.label] || T.t2
                      return (
                        <div key={i} style={{
                          padding: '3px 9px', borderRadius: 5,
                          background: `${col}12`, border: `1px solid ${col}32`,
                          fontFamily: T.fontMono, fontSize: '0.7rem', color: col,
                        }}>
                          {e.text}
                          <span style={{ opacity: 0.45, marginLeft: 5, fontSize: '0.58rem' }}>{e.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )}

              {/* RAG context */}
              {result.rag_context.length > 0 && (
                <Card className="fade-up">
                  <SectionLabel accent={T.teal}>Knowledge Base Context</SectionLabel>
                  {result.rag_context.map((r, i) => (
                    <div key={i} style={{
                      padding: '9px 12px', borderRadius: 7, marginBottom: 7,
                      background: T.surface, border: `1px solid ${T.border}`,
                    }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                        <Chip label={r.source} color={T.teal} />
                        {r.score != null && (
                          <span style={{ fontFamily: T.fontMono, fontSize: '0.59rem', color: T.t3 }}>
                            score: {r.score?.toFixed(3)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: T.fontMono, fontSize: '0.73rem', color: T.t2, lineHeight: 1.55 }}>
                        {r.text}
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}