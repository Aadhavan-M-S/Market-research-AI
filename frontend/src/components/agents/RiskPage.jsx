import { useState, useCallback } from 'react'
import { getRiskAlerts } from '../../api/client.js'

/* ─────────────────────────────────────────────────────────────────────────────
   Design tokens — risk / threat monitoring aesthetic (dark + crimson)
───────────────────────────────────────────────────────────────────────────── */
const T = {
  bg:        '#07090c',
  surface:   '#0b0e15',
  panel:     '#0e1220',
  card:      '#111826',
  border:    '#1a2035',
  borderHi:  '#26304a',

  red:      '#e05e72',
  redDim:   'rgba(224,94,114,0.09)',
  amber:    '#e07860',
  amberDim: 'rgba(224,120,96,0.09)',
  yellow:   '#d4a847',
  yellowDim:'rgba(212,168,71,0.09)',
  green:    '#4caf82',
  greenDim: 'rgba(76,175,130,0.09)',
  blue:     '#4f8ef7',
  blueDim:  'rgba(79,142,247,0.09)',
  teal:     '#1fe4c8',

  t1:  '#dde3f0',
  t2:  '#7a84a0',
  t3:  '#3e4560',
  t4:  '#1c2235',

  fontMono:    "'JetBrains Mono', 'Fira Code', monospace",
  fontDisplay: "'Syne', 'DM Sans', sans-serif",
}

const SEV_META = {
  CRITICAL: { color: T.red,    bg: T.redDim,    label: 'CRITICAL', icon: '🔴' },
  HIGH:     { color: T.amber,  bg: T.amberDim,  label: 'HIGH',     icon: '🟠' },
  MEDIUM:   { color: T.yellow, bg: T.yellowDim, label: 'MEDIUM',   icon: '🟡' },
  LOW:      { color: T.green,  bg: T.greenDim,  label: 'LOW',      icon: '🟢' },
  UNKNOWN:  { color: T.t2,     bg: 'transparent',label: 'UNKNOWN', icon: '⚪' },
}
const getSev = s => SEV_META[(s || 'LOW').toUpperCase()] || SEV_META.LOW

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
    `}</style>
  )
}

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

function CopyBtn({ text, label = 'Copy' }) {
  const [copied, copy] = useCopy(text)
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 5,
      background: copied ? 'rgba(31,228,200,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${copied ? 'rgba(31,228,200,0.3)' : T.border}`,
      color: copied ? T.teal : T.t2,
      fontFamily: T.fontMono, fontSize: '0.67rem', cursor: 'pointer',
      transition: 'all 0.2s',
    }}>
      {copied ? '✓ Copied' : label}
    </button>
  )
}

function SectionLabel({ children, accent }) {
  return (
    <div style={{
      fontFamily: T.fontMono, fontSize: '0.63rem', fontWeight: 600,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      color: accent || T.t2, marginBottom: 12,
    }}>{children}</div>
  )
}

/* ── Overall risk banner ── */
function RiskBanner({ level, total, scanned }) {
  const sev = getSev(level)
  return (
    <div style={{
      padding: '16px 22px', borderRadius: 12,
      background: sev.bg, border: `1px solid ${sev.color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `${sev.color}18`, border: `1px solid ${sev.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem',
        }}>
          {sev.icon}
        </div>
        <div>
          <div style={{
            fontFamily: T.fontMono, fontSize: '0.6rem', letterSpacing: '0.12em',
            color: sev.color, marginBottom: 3,
          }}>
            OVERALL RISK LEVEL
          </div>
          <div style={{
            fontFamily: T.fontDisplay, fontWeight: 800, fontSize: '1.6rem',
            color: sev.color, letterSpacing: '-0.02em',
          }}>
            {level}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: T.fontMono, fontSize: '1.5rem', fontWeight: 700, color: T.t1 }}>
            {total}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t2 }}>risks detected</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: T.fontMono, fontSize: '1.5rem', fontWeight: 700, color: T.t1 }}>
            {scanned}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t2 }}>articles scanned</div>
        </div>
      </div>
    </div>
  )
}

/* ── Risk event card ── */
function RiskCard({ event }) {
  const sev = getSev(event.severity)
  const catColors = {
    supply_chain: T.blue, geopolitical: T.red, financial: T.yellow,
    natural: T.green, cyber: T.amber,
  }
  const copyText = `[${event.severity}] ${event.title}\n${event.description}\nCategories: ${event.categories.join(', ')}`

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${sev.color}`,
      borderRadius: '0 10px 10px 0',
      padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1 }}>
          {/* Severity badge + categories */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
            <span style={{
              padding: '2px 9px', borderRadius: 4,
              background: `${sev.color}18`, border: `1px solid ${sev.color}40`,
              fontFamily: T.fontMono, fontSize: '0.62rem', fontWeight: 700,
              color: sev.color, letterSpacing: '0.07em',
            }}>{sev.icon} {sev.label}</span>
            {event.categories.map(cat => (
              <span key={cat} style={{
                padding: '2px 8px', borderRadius: 4,
                background: `${catColors[cat] || T.blue}14`,
                border: `1px solid ${catColors[cat] || T.blue}35`,
                fontFamily: T.fontMono, fontSize: '0.6rem',
                color: catColors[cat] || T.blue, letterSpacing: '0.05em',
              }}>{cat.replace('_', ' ')}</span>
            ))}
          </div>

          {/* Title */}
          <div style={{
            fontFamily: T.fontDisplay, fontSize: '0.9rem',
            fontWeight: 600, color: T.t1, marginBottom: 5, lineHeight: 1.4,
          }}>
            {event.title}
          </div>

          {/* Description */}
          {event.description && (
            <div style={{
              fontFamily: T.fontMono, fontSize: '0.73rem',
              color: T.t2, lineHeight: 1.55, marginBottom: 6,
            }}>
              {event.description.slice(0, 180)}{event.description.length > 180 ? '…' : ''}
            </div>
          )}

          {/* Keywords */}
          {event.keywords && event.keywords.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {event.keywords.map(kw => (
                <span key={kw} style={{
                  padding: '1px 7px', borderRadius: 3,
                  background: T.t4, border: `1px solid ${T.border}`,
                  fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3,
                }}>{kw}</span>
              ))}
            </div>
          )}
        </div>
        <CopyBtn text={copyText} />
      </div>

      {/* Source URL */}
      {event.url && (
        <div style={{ marginTop: 8 }}>
          <a href={event.url} target="_blank" rel="noopener noreferrer" style={{
            fontFamily: T.fontMono, fontSize: '0.65rem', color: T.blue,
            textDecoration: 'none', opacity: 0.7,
          }}>
            ↗ {event.url.slice(0, 60)}{event.url.length > 60 ? '…' : ''}
          </a>
        </div>
      )}
    </div>
  )
}

/* ── Supply chain graph (static layout) ── */
function SupplyChainGraph({ data }) {
  if (!data || !data.nodes || data.nodes.length === 0) return null

  const nodeOrder = ['Raw Materials', 'Manufacturing', 'Logistics', 'Distribution', 'Retail', 'End Customer']
  const sorted = [...data.nodes].sort((a, b) => nodeOrder.indexOf(a.id) - nodeOrder.indexOf(b.id))

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 20,
    }}>
      <SectionLabel accent={T.blue}>Supply Chain Impact Map</SectionLabel>
      {data.most_affected && data.most_affected !== 'None' && (
        <div style={{
          padding: '6px 12px', borderRadius: 6, marginBottom: 14,
          background: T.redDim, border: `1px solid ${T.red}30`,
          fontFamily: T.fontMono, fontSize: '0.72rem', color: T.red,
        }}>
          ⚠ Most impacted node: <strong>{data.most_affected}</strong>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
        {sorted.map((node, i) => {
          const hasImpact = node.affected && node.affected.length > 0
          return (
            <div key={node.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {/* Node */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '10px 12px', borderRadius: 10, minWidth: 100,
                background: hasImpact ? T.redDim : T.surface,
                border: `1px solid ${hasImpact ? T.red + '40' : T.border}`,
                position: 'relative',
              }}>
                <div style={{
                  fontFamily: T.fontMono, fontSize: '0.68rem', fontWeight: 600,
                  color: hasImpact ? T.red : T.t2, textAlign: 'center', marginBottom: 5,
                }}>
                  {node.id}
                </div>
                {hasImpact ? (
                  <div style={{
                    padding: '2px 7px', borderRadius: 4,
                    background: `${T.red}20`, fontFamily: T.fontMono,
                    fontSize: '0.58rem', color: T.red,
                  }}>
                    {node.affected.length} risk{node.affected.length > 1 ? 's' : ''}
                  </div>
                ) : (
                  <div style={{
                    padding: '2px 7px', borderRadius: 4,
                    background: T.greenDim, fontFamily: T.fontMono,
                    fontSize: '0.58rem', color: T.green,
                  }}>
                    normal
                  </div>
                )}
              </div>
              {/* Arrow */}
              {i < sorted.length - 1 && (
                <div style={{
                  fontFamily: T.fontMono, color: T.t3, fontSize: '1.1rem',
                  padding: '0 6px', userSelect: 'none',
                }}>→</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Impact analysis card ── */
function ImpactCard({ analysis, recommendations }) {
  const fullText = `IMPACT ANALYSIS\n\n${analysis}\n\nRECOMMENDATIONS\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t2, letterSpacing: '0.1em' }}>
          EXECUTIVE RISK BRIEF
        </span>
        <CopyBtn text={fullText} label="Export Brief" />
      </div>

      {/* Analysis */}
      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}` }}>
        <SectionLabel>Impact Analysis</SectionLabel>
        <div style={{
          fontFamily: T.fontDisplay, fontSize: '0.9rem',
          color: T.t1, lineHeight: 1.75, whiteSpace: 'pre-wrap',
        }}>
          {analysis}
        </div>
      </div>

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div style={{ padding: '18px 20px' }}>
          <SectionLabel accent={T.teal}>Recommendations</SectionLabel>
          {recommendations.map((r, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '10px 12px', marginBottom: 8, borderRadius: 8,
              background: 'rgba(31,228,200,0.04)', border: `1px solid rgba(31,228,200,0.12)`,
            }}>
              <div style={{
                minWidth: 22, height: 22, borderRadius: '50%',
                background: 'rgba(31,228,200,0.12)', border: '1px solid rgba(31,228,200,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: T.fontMono, fontSize: '0.65rem', fontWeight: 700, color: T.teal,
                flexShrink: 0, marginTop: 1,
              }}>
                {i + 1}
              </div>
              <div style={{
                fontFamily: T.fontDisplay, fontSize: '0.88rem',
                color: T.t1, lineHeight: 1.6,
              }}>{r}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Filter bar ── */
function FilterBar({ active, setActive }) {
  const filters = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {filters.map(f => {
        const sev = f === 'ALL' ? { color: T.t2, bg: T.t4 } : getSev(f)
        const isActive = active === f
        return (
          <button key={f} onClick={() => setActive(f)} style={{
            padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
            fontFamily: T.fontMono, fontSize: '0.65rem', letterSpacing: '0.06em',
            background: isActive ? `${sev.color}18` : 'transparent',
            border: `1px solid ${isActive ? sev.color + '50' : T.border}`,
            color: isActive ? sev.color : T.t3,
            transition: 'all 0.2s',
          }}>{f}</button>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Main RiskPage component
═══════════════════════════════════════════════════════════════════════════════ */
export default function RiskPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('ALL')

  const handleFetch = useCallback(async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await getRiskAlerts()
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const filteredRisks = result
    ? (filter === 'ALL'
        ? result.detected_risks
        : result.detected_risks.filter(r => r.severity?.toUpperCase() === filter))
    : []

  return (
    <div style={{
      background: T.bg, minHeight: '100vh',
      padding: '32px 28px', fontFamily: T.fontDisplay, color: T.t1,
    }}>
      <FontLoader />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg, #e05e72 0%, #e07860 100%)',
              borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}>⚡</div>
            <h1 style={{
              fontFamily: T.fontDisplay, fontWeight: 800, fontSize: '1.5rem',
              letterSpacing: '-0.03em', color: T.t1, margin: 0,
            }}>Risk Monitoring Agent</h1>
          </div>
          <p style={{ fontFamily: T.fontMono, fontSize: '0.75rem', color: T.t2, margin: 0 }}>
            Live news · Supply chain impact · AI-generated risk brief
          </p>
        </div>

        <button
          onClick={handleFetch}
          disabled={loading}
          style={{
            padding: '10px 22px', borderRadius: 9,
            background: loading ? T.t4 : T.redDim,
            border: `1px solid ${loading ? T.border : T.red + '50'}`,
            color: loading ? T.t2 : T.red,
            fontFamily: T.fontMono, fontSize: '0.82rem', fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing: '0.04em', transition: 'all 0.2s',
          }}
        >
          {loading ? 'Scanning…' : '⚡ Run Scan'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: 320, gap: 14,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
          marginBottom: 20,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: `3px solid ${T.border}`, borderTopColor: T.red,
            animation: 'spin 0.9s linear infinite',
          }} />
          <div style={{ fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t2 }}>
            Fetching RSS feeds · Classifying events · Building risk brief…
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 9, marginBottom: 16,
          background: T.redDim, border: `1px solid ${T.red}30`,
          fontFamily: T.fontMono, fontSize: '0.75rem', color: T.red,
        }}>{error}</div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: 360, gap: 12, opacity: 0.45,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
        }}>
          <div style={{ fontSize: '3.5rem' }}>📡</div>
          <div style={{ fontFamily: T.fontMono, fontSize: '0.82rem', color: T.t2, textAlign: 'center', lineHeight: 1.6 }}>
            Click <strong style={{ color: T.red }}>Run Scan</strong> to fetch live news<br />
            and analyze supply chain risk signals.
          </div>
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Overall risk banner */}
          <RiskBanner
            level={result.risk_level}
            total={result.detected_risks?.length || 0}
            scanned={result.total_articles_scanned || 0}
          />

          {/* Supply chain map */}
          {result.supply_chain_impact && (
            <SupplyChainGraph data={result.supply_chain_impact} />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 18, alignItems: 'start' }}>

            {/* ── Left: Risk events ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: T.fontMono, fontSize: '0.63rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.t2 }}>
                  Risk Events ({filteredRisks.length})
                </div>
                <FilterBar active={filter} setActive={setFilter} />
              </div>

              {filteredRisks.length === 0 ? (
                <div style={{
                  padding: '24px', borderRadius: 10, textAlign: 'center',
                  background: T.surface, border: `1px solid ${T.border}`,
                  fontFamily: T.fontMono, fontSize: '0.75rem', color: T.t3,
                }}>
                  No {filter !== 'ALL' ? filter : ''} risk events detected.
                </div>
              ) : (
                filteredRisks.map((event, i) => <RiskCard key={i} event={event} />)
              )}
            </div>

            {/* ── Right: Impact analysis ── */}
            <div>
              <ImpactCard
                analysis={result.impact_analysis}
                recommendations={result.recommendations || []}
              />
              <div style={{
                marginTop: 10, padding: '8px 14px',
                background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8,
                fontFamily: T.fontMono, fontSize: '0.65rem', color: T.t3,
              }}>
                ⏱ Processed in {result.processing_time_ms?.toFixed(0)}ms
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
