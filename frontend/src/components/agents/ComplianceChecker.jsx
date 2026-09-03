import { useState, useCallback, useRef, useEffect } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   Design tokens — legal/consultancy aesthetic
   Dark obsidian base · amber-gold accents · clinical typography
   Font: JetBrains Mono (mono) + Syne (display)
───────────────────────────────────────────────────────────────────────────── */
const T = {
  bg:        '#080a0d',
  surface:   '#0d1017',
  panel:     '#111520',
  card:      '#141926',
  border:    '#1c2235',
  borderHi:  '#2a3350',

  gold:      '#c8972a',
  goldDim:   'rgba(200,151,42,0.12)',
  goldGlow:  'rgba(200,151,42,0.06)',

  critical:  '#e05e72',
  high:      '#e07860',
  medium:    '#d4a847',
  low:       '#4caf82',
  info:      '#5b8ef5',
  teal:      '#3fbfa0',

  t1:   '#dde3f0',
  t2:   '#7a84a0',
  t3:   '#3e4560',
  t4:   '#252c40',

  fontMono:    "'JetBrains Mono', 'Fira Code', monospace",
  fontDisplay: "'Syne', 'DM Sans', sans-serif",
}

const SEV_META = {
  CRITICAL: { color: T.critical, bg: 'rgba(224,94,114,0.06)', label: 'CRITICAL' },
  HIGH:     { color: T.high,     bg: 'rgba(224,120,96,0.06)', label: 'HIGH' },
  MEDIUM:   { color: T.medium,   bg: 'rgba(212,168,71,0.06)', label: 'MEDIUM' },
  LOW:      { color: T.low,      bg: 'rgba(76,175,130,0.06)', label: 'LOW' },
}
const getSev = s => SEV_META[(s || 'MEDIUM').toUpperCase()] || SEV_META.MEDIUM

/* ── Google Fonts loader ── */
function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
    `}</style>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Utility hooks / helpers
───────────────────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────────────────
   Micro components
───────────────────────────────────────────────────────────────────────────── */
function CopyBtn({ text, label = 'Copy' }) {
  const [copied, copy] = useCopy(text)
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 11px', borderRadius: 5,
      background: copied ? 'rgba(76,175,130,0.1)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${copied ? 'rgba(76,175,130,0.3)' : T.border}`,
      color: copied ? T.low : T.t2,
      fontFamily: T.fontMono, fontSize: '0.68rem', cursor: 'pointer',
      transition: 'all 0.2s',
    }}>
      {copied ? '✓' : '⎘'} {copied ? 'Copied' : label}
    </button>
  )
}

function Tag({ children, color }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4,
      background: `${color}14`, border: `1px solid ${color}30`,
      fontFamily: T.fontMono, fontSize: '0.63rem',
      color, letterSpacing: '0.05em',
    }}>{children}</span>
  )
}

function Divider() {
  return <div style={{ height: 1, background: T.border, margin: '4px 0' }} />
}

/* ── Loading skeleton ── */
function Shimmer({ w = '100%', h = 14, br = 5, style = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: br,
      background: `linear-gradient(90deg, ${T.card} 25%, ${T.border} 50%, ${T.card} 75%)`,
      backgroundSize: '400% 100%', animation: 'shimmer 1.4s infinite',
      ...style,
    }} />
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ padding: 22, borderRadius: 12, background: T.panel, border: `1px solid ${T.border}` }}>
          <Shimmer h={10} w="30%" style={{ marginBottom: 14 }} />
          <Shimmer h={22} w="55%" style={{ marginBottom: 12 }} />
          <Shimmer h={12} w="75%" style={{ marginBottom: 8 }} />
          <Shimmer h={12} w="60%" />
        </div>
      ))}
    </div>
  )
}

/* ── Risk arc gauge ── */
function RiskGauge({ score, label }) {
  const pct   = Math.min(Math.round(score ?? 0), 100)
  const color = pct >= 70 ? T.critical : pct >= 40 ? T.high : pct >= 20 ? T.medium : T.low
  // Arc: radius=38, circumference≈238.6; sweep covers 240° of the circle
  const ARC_LEN   = 238.6
  const filled    = (pct / 100) * ARC_LEN
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={100} height={65} viewBox="0 0 100 65">
        {/* Track */}
        <path d="M10,52 A38,38 0 0,1 90,52" fill="none"
          stroke={T.border} strokeWidth={8} strokeLinecap="round" />
        {/* Fill */}
        <path d="M10,52 A38,38 0 0,1 90,52" fill="none"
          stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${filled} ${ARC_LEN}`}
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }}
        />
        {/* Score text */}
        <text x="50" y="52" textAnchor="middle" fill={color}
          style={{ fontFamily: T.fontMono, fontSize: '15px', fontWeight: 600 }}>
          {pct}
        </text>
        <text x="50" y="62" textAnchor="middle" fill={T.t3}
          style={{ fontFamily: T.fontMono, fontSize: '6px' }}>
          / 100
        </text>
      </svg>
      <div>
        <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.12em', marginBottom: 3 }}>
          RISK SCORE
        </div>
        <div style={{
          fontFamily: T.fontDisplay, fontSize: '1.5rem', fontWeight: 800,
          color, letterSpacing: '-0.03em',
        }}>
          {label || (pct >= 70 ? 'CRITICAL' : pct >= 40 ? 'HIGH' : pct >= 20 ? 'MEDIUM' : 'LOW')}
        </div>
      </div>
    </div>
  )
}

/* ── Confidence bar ── */
function ConfBar({ value, color }) {
  const pct = Math.round((value ?? 0) * 100)
  const c   = color || (pct >= 70 ? T.high : pct >= 40 ? T.medium : T.low)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontFamily: T.fontMono, fontSize: '0.65rem', color: c, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

/* ── Horizontal bar chart ── */
function HBar({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ width: 62, fontFamily: T.fontMono, fontSize: '0.64rem', color: T.t2, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.7s ease' }} />
      </div>
      <span style={{ width: 18, fontFamily: T.fontMono, fontSize: '0.64rem', color, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Issue card — expandable
───────────────────────────────────────────────────────────────────────────── */
function IssueCard({ issue }) {
  const [open, setOpen] = useState(false)
  const sev = getSev(issue.severity)
  const conf = Math.round((issue.confidence ?? 0) * 100)

  return (
    <div style={{
      borderRadius: 9,
      background: sev.bg,
      border: `1px solid ${sev.color}25`,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header row */}
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', padding: '12px 16px',
        background: 'none', border: 'none', cursor: 'pointer',
        textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Severity dot */}
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sev.color, flexShrink: 0 }} />

        {/* Rule name */}
        <span style={{ flex: 1, fontFamily: T.fontDisplay, fontSize: '0.82rem', fontWeight: 600, color: T.t1, lineHeight: 1.3 }}>
          {issue.rule}
        </span>

        {/* Badges */}
        <span style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
          {issue.law && <Tag color={T.info}>{issue.law}</Tag>}
          {issue.article && <Tag color={T.t2}>{issue.article}</Tag>}
          <Tag color={sev.color}>{sev.label}</Tag>
        </span>

        {/* Confidence */}
        <span style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3, flexShrink: 0 }}>
          {conf}%
        </span>

        {/* Chevron */}
        <span style={{ color: T.t3, flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Divider />

          {/* Two-column: user excerpt | law excerpt */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.1em', marginBottom: 6 }}>
                ▶ FLAGGED TEXT
              </div>
              <blockquote style={{
                margin: 0, padding: '8px 12px',
                background: 'rgba(0,0,0,0.3)',
                borderLeft: `3px solid ${sev.color}`,
                borderRadius: '0 6px 6px 0',
                fontFamily: T.fontMono, fontSize: '0.73rem', color: T.t2, lineHeight: 1.6,
              }}>
                "{(issue.excerpt || '—').slice(0, 200)}"
              </blockquote>
            </div>
            {issue.law_excerpt && (
              <div>
                <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.1em', marginBottom: 6 }}>
                  ⚖ RETRIEVED LAW
                </div>
                <blockquote style={{
                  margin: 0, padding: '8px 12px',
                  background: 'rgba(91,142,245,0.05)',
                  borderLeft: `3px solid ${T.info}`,
                  borderRadius: '0 6px 6px 0',
                  fontFamily: T.fontMono, fontSize: '0.73rem', color: T.t2, lineHeight: 1.6,
                }}>
                  "{issue.law_excerpt.slice(0, 200)}"
                </blockquote>
              </div>
            )}
          </div>

          {/* Explanation */}
          {issue.explanation && (
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.1em', marginBottom: 6 }}>
                ✦ LEGAL ANALYSIS
              </div>
              <p style={{ margin: 0, fontSize: '0.81rem', color: T.t1, lineHeight: 1.7, fontFamily: T.fontDisplay }}>
                {issue.explanation}
              </p>
            </div>
          )}

          {/* Suggestion */}
          {issue.suggestion && (
            <div style={{
              padding: '8px 12px', borderRadius: 7,
              background: `${T.teal}08`, border: `1px solid ${T.teal}20`,
            }}>
              <span style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.teal, letterSpacing: '0.1em', marginRight: 8 }}>
                → REMEDIATION
              </span>
              <span style={{ fontSize: '0.8rem', color: T.t2 }}>{issue.suggestion}</span>
            </div>
          )}

          {/* Confidence bar */}
          <div>
            <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, marginBottom: 5 }}>
              RETRIEVAL + NLI CONFIDENCE
            </div>
            <ConfBar value={issue.confidence} color={sev.color} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Visualisations panel
───────────────────────────────────────────────────────────────────────────── */
function VisPanel({ issues, riskScore }) {
  if (!issues?.length) return null

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  issues.forEach(i => { const k = (i.severity || 'MEDIUM').toUpperCase(); if (k in counts) counts[k]++ })
  const maxCount = Math.max(...Object.values(counts), 1)

  const totalIssues = issues.length
  const violPct     = Math.min(Math.round((riskScore ?? 0)), 100)
  const compPct     = 100 - violPct

  const avgConf = issues.length
    ? Math.round(issues.reduce((s, i) => s + (i.confidence ?? 0), 0) / issues.length * 100)
    : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
      {/* Severity distribution */}
      <div style={{ padding: 18, borderRadius: 10, background: T.panel, border: `1px solid ${T.border}`, gridColumn: '1 / 2' }}>
        <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.1em', marginBottom: 14 }}>
          SEVERITY DISTRIBUTION
        </div>
        {Object.entries(counts).filter(([, v]) => v > 0).map(([sev, val]) => (
          <HBar key={sev} label={sev} value={val} max={maxCount} color={getSev(sev).color} />
        ))}
        {Object.values(counts).every(v => v === 0) && (
          <div style={{ color: T.t3, fontSize: '0.75rem' }}>No issues found.</div>
        )}
      </div>

      {/* Compliance donut */}
      <div style={{ padding: 18, borderRadius: 10, background: T.panel, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.1em' }}>
          COMPLIANCE RATIO
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg viewBox="0 0 36 36" width={62} height={62} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle cx="18" cy="18" r="13" fill="none" stroke={T.border} strokeWidth={4} />
            <circle cx="18" cy="18" r="13" fill="none" stroke={T.low}
              strokeWidth={4}
              strokeDasharray={`${compPct * 0.817} 81.7`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.9s ease' }}
            />
          </svg>
          <div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: '1.5rem', fontWeight: 800, color: T.t1 }}>{compPct}%</div>
            <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3 }}>compliant</div>
            <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.high, marginTop: 2 }}>{violPct}% risk</div>
          </div>
        </div>
      </div>

      {/* Avg confidence */}
      <div style={{ padding: 18, borderRadius: 10, background: T.panel, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
        <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.1em' }}>
          AVG RETRIEVAL CONFIDENCE
        </div>
        <div style={{ fontFamily: T.fontDisplay, fontSize: '2rem', fontWeight: 800, color: T.info }}>
          {avgConf}%
        </div>
        <ConfBar value={avgConf / 100} color={T.info} />
        <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3 }}>
          across {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Entity chips
───────────────────────────────────────────────────────────────────────────── */
const ENT_COLORS = { ORG: T.info, PERSON: '#a78bfa', LAW: '#fb923c', GPE: T.teal, DATE: T.medium, PRODUCT: '#f472b6', MISC: T.t2 }
function EntitySection({ entities }) {
  if (!entities?.length) return <div style={{ color: T.t3, fontSize: '0.78rem' }}>No entities detected.</div>
  const groups = {}
  entities.forEach(e => {
    const lbl = (e.label || 'MISC').toUpperCase()
    if (!groups[lbl]) groups[lbl] = []
    if (!groups[lbl].includes(e.text)) groups[lbl].push(e.text)
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Object.entries(groups).map(([type, items]) => {
        const c = ENT_COLORS[type] || ENT_COLORS.MISC
        return (
          <div key={type} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ minWidth: 56, fontFamily: T.fontMono, fontSize: '0.6rem', color: c, paddingTop: 3 }}>{type}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {items.map((item, i) => (
                <span key={i} style={{
                  padding: '2px 8px', borderRadius: 4,
                  background: `${c}10`, border: `1px solid ${c}22`,
                  fontFamily: T.fontMono, fontSize: '0.7rem', color: c,
                }}>{item}</span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tab bar
───────────────────────────────────────────────────────────────────────────── */
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: T.surface, borderRadius: 7, padding: 3, border: `1px solid ${T.border}` }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: 1, padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
          background: active === t.id ? T.panel : 'transparent',
          color: active === t.id ? T.t1 : T.t3,
          fontFamily: T.fontMono, fontSize: '0.66rem',
          transition: 'all 0.15s',
          boxShadow: active === t.id ? '0 1px 4px rgba(0,0,0,0.4)' : 'none',
        }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Section wrapper
───────────────────────────────────────────────────────────────────────────── */
function Section({ title, badge, accent = T.gold, right, children }) {
  return (
    <div style={{
      borderRadius: 12,
      background: T.panel,
      border: `1px solid ${T.border}`,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: `linear-gradient(135deg, ${accent}08 0%, transparent 100%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: accent }} />
          <span style={{
            fontFamily: T.fontMono, fontSize: '0.65rem', fontWeight: 600,
            letterSpacing: '0.12em', color: T.t1, textTransform: 'uppercase',
          }}>
            {title}
          </span>
          {badge != null && (
            <span style={{
              padding: '1px 8px', borderRadius: 100,
              background: `${accent}15`, border: `1px solid ${accent}30`,
              fontFamily: T.fontMono, fontSize: '0.6rem', color: accent,
            }}>
              {badge}
            </span>
          )}
        </div>
        {right}
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────────────── */
const REGULATIONS = ['GDPR', 'HIPAA']
const SAMPLE_DOC = `Our platform collects user data including email addresses, browsing history, purchase behavior, and device identifiers. This data is shared with third-party advertising partners without explicit user consent. We retain user records indefinitely and do not provide users the ability to request deletion of their data. Health-related queries are logged and associated with user profiles. Users in California are not notified about data sales to third parties. Passwords are stored in plain text in our database. We share health information with marketing partners without limiting disclosure to what is minimally necessary.`

/* ─────────────────────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────────────────────── */
export default function ComplianceChecker() {
  const [text, setText]         = useState('')
  const [selRegs, setSelRegs]   = useState(['GDPR', 'CCPA'])
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [tab, setTab]           = useState('entities')

  const toggleReg = r => setSelRegs(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])

  const handleRun = async () => {
    if (!text.trim() || !selRegs.length) return
    setLoading(true); setError(null); setResult(null)
    try {
      const { runComplianceCheck } = await import('../../api/client.js')
      const data = await runComplianceCheck({ document: text.trim(), regulations: selRegs })
      setResult(data)
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Derived values ── */
  const issues      = result?.issues ?? []
  const riskScore   = result?.risk_score ?? 0
  const overallRisk = result?.overall_risk ?? null
  const recs        = result?.recommendations ?? []
  const compliant   = result?.compliant_sections ?? []
  const entities    = result?.entities ?? []
  const nlpMeta     = result?.nlp_meta ?? null

  const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const sortedIssues = [...issues].sort((a, b) =>
    (sevOrder[(a.severity || 'MEDIUM').toUpperCase()] ?? 3) -
    (sevOrder[(b.severity || 'MEDIUM').toUpperCase()] ?? 3)
  )

  const fullReport = result ? [
    '═══════════════════════════════════════',
    ' COMPLIANCE ANALYSIS REPORT',
    '═══════════════════════════════════════',
    `Overall Risk : ${overallRisk ?? '—'}`,
    `Risk Score   : ${riskScore}/100`,
    `Issues       : ${issues.length}`,
    '',
    '── VIOLATIONS ──',
    ...sortedIssues.map((i, n) =>
      `${n + 1}. [${i.severity}] ${i.rule}\n   ${i.article ? `(${i.article}) ` : ''}${i.suggestion}`
    ),
    '',
    '── RECOMMENDATIONS ──',
    ...recs.map((r, n) => `${n + 1}. ${r}`),
  ].join('\n') : ''

  const canRun = text.trim().length > 0 && selRegs.length > 0 && !loading

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.fontDisplay }}>
      <FontLoader />
      <style>{`
        @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        .fade-in { animation: fadeUp 0.4s ease both }
        * { box-sizing: border-box; }
        textarea { outline: none; color-scheme: dark; }
        button { outline: none; }
      `}</style>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          {/* Logo mark */}
          <div style={{
            width: 46, height: 46, borderRadius: 12,
            background: T.goldDim, border: `1px solid ${T.gold}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>⚖</div>
          <div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: '1.25rem', fontWeight: 800, color: T.t1, letterSpacing: '-0.02em' }}>
              Compliance Intelligence
            </div>
            <div style={{ fontFamily: T.fontMono, fontSize: '0.65rem', color: T.t3 }}>
              Hybrid RAG · BM25 + FAISS · DeBERTa NLI · Law-Grounded Analysis
            </div>
          </div>
          {/* Pipeline badges */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {[['BM25', T.gold], ['FAISS', T.info], ['NLI', T.teal], ['GDPR Corpus', T.low], ['HIPAA Corpus', T.high]].map(([label, color]) => (
              <span key={label} style={{
                padding: '2px 9px', borderRadius: 4,
                background: `${color}10`, border: `1px solid ${color}25`,
                fontFamily: T.fontMono, fontSize: '0.6rem', color,
              }}>{label}</span>
            ))}
          </div>
        </div>

        {/* ── Input panel ── */}
        <div style={{ padding: 22, borderRadius: 12, background: T.panel, border: `1px solid ${T.border}`, marginBottom: 20 }}>
          {/* Regulation toggles */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.1em', marginBottom: 10 }}>
              REGULATORY FRAMEWORKS
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {REGULATIONS.map(r => {
                const active = selRegs.includes(r)
                return (
                  <button key={r} onClick={() => toggleReg(r)} style={{
                    padding: '6px 16px', borderRadius: 6,
                    background: active ? T.goldDim : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${active ? `${T.gold}50` : T.border}`,
                    color: active ? T.gold : T.t3,
                    fontFamily: T.fontMono, fontSize: '0.73rem', fontWeight: active ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>{r}</button>
                )
              })}
            </div>
          </div>

          {/* Document input */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3, letterSpacing: '0.1em' }}>POLICY DOCUMENT</div>
              <button onClick={() => setText(SAMPLE_DOC)} style={{
                fontFamily: T.fontMono, fontSize: '0.64rem', color: T.info,
                background: 'none', border: 'none', cursor: 'pointer',
              }}>
                ↓ Load non-compliant sample
              </button>
            </div>
            <textarea
              placeholder="Paste your privacy policy, data processing agreement, terms of service, or any compliance document…"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={7}
              style={{
                width: '100%', resize: 'vertical',
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 8, color: T.t1, padding: '12px 14px',
                fontFamily: T.fontMono, fontSize: '0.78rem', lineHeight: 1.7,
                transition: 'border-color 0.2s',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3 }}>
                {text.length.toLocaleString()} chars · {text.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
          </div>

          {/* Run button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleRun} disabled={!canRun} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 22px', borderRadius: 8,
              background: canRun ? T.goldDim : 'rgba(255,255,255,0.02)',
              border: `1px solid ${canRun ? `${T.gold}50` : T.border}`,
              color: canRun ? T.gold : T.t3,
              fontFamily: T.fontMono, fontSize: '0.78rem', fontWeight: 600,
              cursor: canRun ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            }}>
              {loading
                ? <><span style={{ display: 'inline-block', width: 13, height: 13, border: `2px solid ${T.gold}40`, borderTopColor: T.gold, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Analysing…</>
                : <>⚡ Run Analysis</>
              }
            </button>
            {!text.trim() && (
              <span style={{ fontFamily: T.fontMono, fontSize: '0.63rem', color: T.t3 }}>
                Paste a document to enable analysis
              </span>
            )}
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            padding: '12px 18px', borderRadius: 9, marginBottom: 18,
            background: 'rgba(224,94,114,0.07)', border: `1px solid rgba(224,94,114,0.25)`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: T.critical }}>✕</span>
              <span style={{ fontSize: '0.82rem', color: T.critical }}>{error}</span>
            </div>
            <button onClick={handleRun} style={{
              fontFamily: T.fontMono, fontSize: '0.68rem', color: T.critical,
              background: 'none', border: 'none', cursor: 'pointer',
            }}>↺ Retry</button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && <LoadingSkeleton />}

        {/* ─────────────────────────────────────────────
            Results
        ───────────────────────────────────────────── */}
        {result && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="fade-in">

            {/* 1. Executive Summary */}
            <Section
              title="Executive Summary"
              accent={T.gold}
              right={
                <div style={{ display: 'flex', gap: 8 }}>
                  <CopyBtn text={fullReport} label="Export Report" />
                  <CopyBtn text={JSON.stringify(result, null, 2)} label="Copy JSON" />
                </div>
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                <RiskGauge score={riskScore} label={overallRisk} />

                {/* Stats grid */}
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  {[
                    { label: 'VIOLATIONS', value: issues.length, color: issues.length > 0 ? T.high : T.low },
                    { label: 'COMPLIANT', value: compliant.length, color: T.low },
                    { label: 'REGULATIONS', value: selRegs.length, color: T.info },
                    { label: 'CORPUS', value: 'GDPR+HIPAA', color: T.gold },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontFamily: T.fontDisplay, fontSize: '1.6rem', fontWeight: 800, color: s.color }}>
                        {s.value}
                      </div>
                      <div style={{ fontFamily: T.fontMono, fontSize: '0.58rem', color: T.t3, letterSpacing: '0.1em' }}>
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Top 2 issues preview */}
                {sortedIssues.length > 0 && (
                  <div style={{ flex: 1, minWidth: 200, borderLeft: `1px solid ${T.border}`, paddingLeft: 24 }}>
                    {sortedIssues.slice(0, 2).map((issue, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                        <span style={{ color: getSev(issue.severity).color, flexShrink: 0, marginTop: 1 }}>▶</span>
                        <div>
                          <span style={{ fontFamily: T.fontDisplay, fontSize: '0.8rem', fontWeight: 600, color: getSev(issue.severity).color }}>
                            {issue.rule}
                          </span>
                          {issue.excerpt && (
                            <div style={{ fontFamily: T.fontMono, fontSize: '0.68rem', color: T.t3, marginTop: 2 }}>
                              "{issue.excerpt.slice(0, 60)}…"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* 2. Visualisations */}
            {issues.length > 0 && <VisPanel issues={issues} riskScore={riskScore} />}

            {/* 3. Key Violations */}
            {issues.length > 0 ? (
              <Section title="Key Violations" badge={issues.length} accent={T.high}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => {
                    const group = sortedIssues.filter(i => (i.severity || 'MEDIUM').toUpperCase() === sev)
                    if (!group.length) return null
                    const { color } = getSev(sev)
                    return (
                      <div key={sev}>
                        <div style={{
                          fontFamily: T.fontMono, fontSize: '0.6rem', color,
                          letterSpacing: '0.1em', marginBottom: 8,
                          display: 'flex', alignItems: 'center', gap: 7,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {sev} · {group.length}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {group.map((issue, i) => <IssueCard key={i} issue={issue} />)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Section>
            ) : (
              <div style={{
                padding: '24px 22px', borderRadius: 12,
                background: 'rgba(76,175,130,0.05)', border: `1px solid rgba(76,175,130,0.2)`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <span style={{ fontSize: 24 }}>✓</span>
                <div>
                  <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, color: T.low, marginBottom: 3 }}>
                    No Violations Detected
                  </div>
                  <div style={{ fontSize: '0.8rem', color: T.t2 }}>
                    The document appears compliant with the selected frameworks.
                  </div>
                </div>
              </div>
            )}

            {/* 4. Recommendations */}
            {recs.length > 0 && (
              <Section title="Recommendations" badge={recs.length} accent={T.teal}
                right={<CopyBtn text={recs.map((r, i) => `${i + 1}. ${r}`).join('\n')} label="Copy" />}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recs.map((rec, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '10px 14px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        background: `${T.teal}10`, border: `1px solid ${T.teal}20`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: T.fontMono, fontSize: '0.6rem', color: T.teal,
                      }}>{i + 1}</div>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: T.t2, lineHeight: 1.65 }}>{rec}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 5. Technical Appendix */}
            <Section title="Technical Appendix" accent={T.info}>
              <Tabs
                active={tab}
                onChange={setTab}
                tabs={[
                  { id: 'entities', label: 'Entities' },
                  { id: 'compliant', label: 'Compliant Sections' },
                  { id: 'meta', label: 'NLP Meta' },
                  { id: 'json', label: 'Raw JSON' },
                ]}
              />
              <div style={{ marginTop: 16 }}>
                {tab === 'entities' && <EntitySection entities={entities} />}

                {tab === 'compliant' && (
                  compliant.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {compliant.map((s, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '9px 12px',
                            background: 'rgba(76,175,130,0.04)', borderRadius: 7,
                            border: '1px solid rgba(76,175,130,0.15)',
                          }}>
                            <span style={{ color: T.low, flexShrink: 0, marginTop: 1 }}>✓</span>
                            <span style={{ fontSize: '0.8rem', color: T.t2, lineHeight: 1.6 }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    : <div style={{ color: T.t3, fontSize: '0.78rem' }}>No compliant sections identified.</div>
                )}

                {tab === 'meta' && (
                  nlpMeta
                    ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                        {Object.entries(nlpMeta).filter(([, v]) => typeof v !== 'object').map(([k, v]) => (
                          <div key={k} style={{
                            padding: '10px 12px', background: T.surface, borderRadius: 7,
                            border: `1px solid ${T.border}`,
                          }}>
                            <div style={{ fontFamily: T.fontMono, fontSize: '0.58rem', color: T.t3, letterSpacing: '0.08em', marginBottom: 4 }}>
                              {k.toUpperCase()}
                            </div>
                            <div style={{ fontFamily: T.fontMono, fontSize: '0.8rem', fontWeight: 600, color: T.t1 }}>
                              {String(v)}
                            </div>
                          </div>
                        ))}
                      </div>
                    : <div style={{ color: T.t3, fontSize: '0.78rem' }}>No metadata available.</div>
                )}

                {tab === 'json' && (
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>
                      <CopyBtn text={JSON.stringify(result, null, 2)} label="Copy" />
                    </div>
                    <pre style={{
                      margin: 0, padding: '14px',
                      background: T.surface, borderRadius: 8,
                      border: `1px solid ${T.border}`,
                      fontFamily: T.fontMono, fontSize: '0.68rem',
                      color: T.t2, overflowX: 'auto', lineHeight: 1.6,
                      maxHeight: 400, overflowY: 'auto',
                    }}>
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </Section>

          </div>
        )}
      </div>
    </div>
  )
}