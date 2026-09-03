import { useState, useCallback } from 'react'
import {
  Star, Cpu, AlertCircle, ChevronDown, ChevronUp,
  BarChart3, Layers, Send, Eraser, Copy, Check,
  Zap, AlertTriangle, Tag, Eye
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts'
import { runReviewAnalysis } from '../../api/client.js'

// ─── Design Tokens ────────────────────────────────────────────────────────────
const COLORS = {
  positive: '#22d3a5',
  negative: '#f06b6b',
  neutral:  '#8a96b0',
  accent:   '#f0894a',
  purple:   '#a78bfa',
  blue:     '#60a5fa',
  pink:     '#e879f9',
}

const POS_COLORS = {
  NOUN:  '#60a5fa',
  VERB:  '#34d399',
  ADJ:   '#a78bfa',
  ADV:   '#fb923c',
  PROPN: '#f472b6',
  NUM:   '#facc15',
  PUNCT: '#4b5563',
  DET:   '#6b7280',
  ADP:   '#6b7280',
  CCONJ: '#6b7280',
  SCONJ: '#6b7280',
  AUX:   '#6b7280',
}

const PIE_COLORS = [COLORS.positive, COLORS.negative, COLORS.neutral]

const ENTITY_COLORS = {
  COMPONENT: { bg: '#1e3a5f', border: '#3b82f6', text: '#93c5fd' },
  FIELD:     { bg: '#2d1b69', border: '#7c3aed', text: '#c4b5fd' },
  ORG:       { bg: '#1a3329', border: '#059669', text: '#6ee7b7' },
  PERSON:    { bg: '#3b1f1f', border: '#dc2626', text: '#fca5a5' },
  PRODUCT:   { bg: '#1c2d1c', border: '#16a34a', text: '#86efac' },
  DEFAULT:   { bg: '#1f2937', border: '#4b5563', text: '#9ca3af' },
}

// ─── NLP Technique Badges ─────────────────────────────────────────────────────
const NLP_TECHNIQUES = [
  { label: 'DeBERTa-v3 Sentiment', color: COLORS.accent },
  { label: 'spaCy POS + NER',      color: COLORS.blue },
  { label: 'Sentence Transformers', color: COLORS.positive },
  { label: 'Aspect-Based SA',       color: COLORS.purple },
  { label: 'RAG + Contradiction',   color: COLORS.pink },
]

// ─── Sample Data ──────────────────────────────────────────────────────────────
const SAMPLE_DATA = `Absolutely love this product! The build quality is exceptional and the keyboard feels amazing.
Battery life is disappointing. Barely lasts 4 hours on a full charge.
Solid mid-range option. Nothing spectacular but does the job well enough.
Customer support was outstanding. Resolved my keyboard issue within 2 hours.
The UI is clunky and unintuitive. Not recommended for ML beginners.
The display is stunning — colors are vivid and sharp. Battery could be better though.
Best laptop I have owned. Fast, reliable, and the GPU handles deep learning tasks perfectly.
Keyboard started rattling after 2 weeks. Build quality is inconsistent.`

// ─── Utility Hooks ────────────────────────────────────────────────────────────
function useCopy() {
  const [copied, setCopied] = useState(null)
  const copy = useCallback((text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1800)
    })
  }, [])
  return { copy, copied }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px',
      background: `${color}18`, border: `1px solid ${color}35`,
      borderRadius: 100, fontFamily: 'var(--font-mono)',
      fontSize: '0.7rem', color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function CopyButton({ text, copyKey, copy, copied, style }) {
  const done = copied === copyKey
  return (
    <button
      onClick={() => copy(text, copyKey)}
      title="Copy to clipboard"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 6,
        background: done ? 'rgba(34,211,165,0.12)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${done ? COLORS.positive + '50' : 'var(--glass-border)'}`,
        color: done ? COLORS.positive : 'var(--text-muted)',
        cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'var(--font-mono)',
        transition: 'all .2s', ...style,
      }}
    >
      {done ? <Check size={11} /> : <Copy size={11} />}
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

function SkeletonCard({ height = 120 }) {
  return (
    <div style={{
      height, borderRadius: 14,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      border: '1px solid var(--glass-border)',
    }} />
  )
}

// ─── Sentiment Label Badge ────────────────────────────────────────────────────
function SentimentBadge({ label }) {
  const cfg = {
    POSITIVE: { color: COLORS.positive, bg: 'rgba(34,211,165,0.1)', icon: '↑' },
    NEGATIVE: { color: COLORS.negative, bg: 'rgba(240,107,107,0.1)', icon: '↓' },
    NEUTRAL:  { color: COLORS.neutral,  bg: 'rgba(138,150,176,0.1)', icon: '→' },
  }[label] || { color: COLORS.neutral, bg: 'rgba(138,150,176,0.1)', icon: '—' }
  return (
    <span style={{
      padding: '4px 14px', borderRadius: 100, fontWeight: 700,
      fontSize: '0.8rem', letterSpacing: '0.06em',
      color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.color}40`,
    }}>
      {cfg.icon} {label}
    </span>
  )
}

// ─── POS Tag Visualizer ───────────────────────────────────────────────────────
function POSVisualizer({ posTags }) {
  if (!posTags?.length) return null
  return (
    <div style={{ lineHeight: 2.2, wordBreak: 'break-word' }}>
      {posTags.map((t, i) => {
        const color = POS_COLORS[t.pos] || '#9ca3af'
        const isPunct = ['PUNCT', 'SPACE', 'X'].includes(t.pos)
        return (
          <span key={i} style={{ marginRight: isPunct ? 0 : 4 }}>
            <span style={{
              position: 'relative', display: 'inline-block',
              padding: isPunct ? 0 : '1px 5px',
              borderRadius: 5,
              background: isPunct ? 'transparent' : `${color}18`,
              border: isPunct ? 'none' : `1px solid ${color}30`,
              color: isPunct ? 'var(--text-muted)' : color,
              fontSize: '0.85rem', fontFamily: 'var(--font-mono)',
            }}>
              {t.text}
              {!isPunct && (
                <span style={{
                  position: 'absolute', bottom: -16, left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '0.52rem', color: `${color}99`,
                  whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.05em',
                }}>
                  {t.pos}
                </span>
              )}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ─── Entity Tag ───────────────────────────────────────────────────────────────
function EntityTag({ text, label }) {
  const cfg = ENTITY_COLORS[label] || ENTITY_COLORS.DEFAULT
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 8,
      background: cfg.bg, border: `1px solid ${cfg.border}50`,
      color: cfg.text, fontSize: '0.75rem',
      fontFamily: 'var(--font-mono)',
    }}>
      {text}
      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{label}</span>
    </span>
  )
}

// ─── Phrase Chip ──────────────────────────────────────────────────────────────
function PhraseChip({ text, positive, copy, copied }) {
  const color = positive ? COLORS.positive : COLORS.negative
  const key = `chip-${text}`
  return (
    <span
      onClick={() => copy(text, key)}
      title="Click to copy"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 11px', borderRadius: 100, cursor: 'pointer',
        background: `${color}12`, border: `1px solid ${color}35`,
        color, fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
        transition: 'all .15s',
        boxShadow: copied === key ? `0 0 0 2px ${color}50` : 'none',
      }}
    >
      {copied === key ? <Check size={10} /> : <Copy size={10} />}
      {text}
    </span>
  )
}

// ─── Contradiction Card ───────────────────────────────────────────────────────
function ContradictionCard({ c }) {
  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e2e8f0' }}>
          {c.aspect}
        </span>
        <span style={{
          fontSize: '0.65rem', padding: '2px 8px', borderRadius: 100,
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
          color: '#fbbf24',
        }}>
          Score {c.polarisation_score?.toFixed(2)}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{
          padding: '10px 14px',
          background: 'rgba(34,211,165,0.06)',
          borderTop: `2px solid ${COLORS.positive}`,
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', color: COLORS.positive, marginBottom: 5 }}>
            ↑ POSITIVE {c.positive_pct?.toFixed(0)}%
          </div>
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
            {c.positive_example || '—'}
          </p>
        </div>
        <div style={{
          padding: '10px 14px',
          background: 'rgba(240,107,107,0.06)',
          borderTop: `2px solid ${COLORS.negative}`,
          borderLeft: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', color: COLORS.negative, marginBottom: 5 }}>
            ↓ NEGATIVE {c.negative_pct?.toFixed(0)}%
          </div>
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
            {c.negative_example || '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Cluster Card ─────────────────────────────────────────────────────────────
function ClusterCard({ c }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderRadius: 12, border: '1px solid rgba(167,139,250,0.2)',
      background: 'rgba(167,139,250,0.04)', overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '12px 14px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={14} color={COLORS.purple} />
          <span style={{ fontWeight: 600, fontSize: '0.83rem' }}>{c.theme}</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            {c.size} review{c.size !== 1 ? 's' : ''}
          </span>
        </div>
        {open ? <ChevronUp size={13} color="var(--text-muted)" /> : <ChevronDown size={13} color="var(--text-muted)" />}
      </button>
      {open && c.samples?.length > 0 && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {c.samples.map((s, i) => (
            <p key={i} style={{
              fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.6,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              borderLeft: `2px solid ${COLORS.purple}50`,
              margin: 0,
            }}>
              {s}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReviewAnalysis() {
  const [productName, setProductName]   = useState('')
  const [rawReviews, setRawReviews]     = useState('')
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState(null)
  const [error, setError]               = useState(null)
  const [showRaw, setShowRaw]           = useState(false)
  const { copy, copied }                = useCopy()

  const reviewList = rawReviews.split('\n').filter(r => r.trim().length > 0)

  const handleLoadSamples = () => {
    setProductName('TechPro X200')
    setRawReviews(SAMPLE_DATA)
  }

  const handleClear = () => {
    setRawReviews(''); setProductName(''); setResult(null); setError(null)
  }

  const handleSubmit = async () => {
    if (!productName.trim() || reviewList.length === 0) return
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await runReviewAnalysis({
        product_name: productName.trim(),
        reviews: reviewList,
        use_embeddings: true,
      })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const ss         = result?.sentiment_scores
  const confidence = ss?.avg_confidence ?? 0
  const overallLabel = result?.overall_sentiment ?? 'NEUTRAL'
  const sentLabelColor = overallLabel === 'POSITIVE' ? COLORS.positive
                       : overallLabel === 'NEGATIVE' ? COLORS.negative
                       : COLORS.neutral

  const pieData = ss ? [
    { name: 'Positive', value: ss.positive },
    { name: 'Negative', value: ss.negative },
    { name: 'Neutral',  value: ss.neutral  },
  ] : []

  const aspects = result?.aspect_sentiments?.filter(a => a.aspect !== 'LLM Summary') ?? []
  const barData = aspects.map(a => ({
    name: a.aspect,
    Positive: a.positive_pct,
    Negative: a.negative_pct,
  }))

  const llmSummary = result?.aspect_sentiments?.find(a => a.aspect === 'LLM Summary')?.llm_insight ?? ''

  return (
    <div className="agent-page">
      {/* Shimmer keyframe */}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          background: 'rgba(240,137,74,0.12)',
          border: '1px solid rgba(240,137,74,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <BarChart3 size={20} color={COLORS.accent} />
        </div>
        <h1 className="agent-page__title" style={{
          background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.pink})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Review Analysis
        </h1>
      </div>
      <p className="agent-page__subtitle">
        Paste reviews (one per line) for deep sentiment, aspect extraction, entity detection and contradiction analysis.
      </p>

      {/* NLP Stack */}
      <div className="hood-panel" style={{ marginBottom: 24 }}>
        <div className="hood-panel__header">
          <Cpu size={13} color={COLORS.accent} style={{ marginRight: 4 }} />
          NLP Stack
        </div>
        <div className="hood-panel__badges">
          {NLP_TECHNIQUES.map(t => <Badge key={t.label} {...t} />)}
        </div>
      </div>

      {/* Input */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="agent-form">
          <div className="form-group">
            <label className="form-label">Product Name</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                className="glass-input"
                placeholder="e.g. Sony WH-1000XM5"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                style={{ flex: 1 }}
              />
              <button onClick={handleLoadSamples} className="glass-btn glass-btn--ghost"
                style={{ padding: '0 15px', fontSize: '0.7rem' }}>
                Load Demo
              </button>
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="form-label">
                Review Dataset ({reviewList.length} detected)
              </label>
              <button onClick={handleClear} style={{
                background: 'none', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem',
              }}>
                <Eraser size={12} /> Clear all
              </button>
            </div>
            <textarea
              className="glass-input"
              placeholder="Paste reviews here. One review per line..."
              value={rawReviews}
              onChange={e => setRawReviews(e.target.value)}
              rows={8}
              style={{ lineHeight: '1.6', fontFamily: 'inherit' }}
            />
          </div>

          <button
            className="glass-btn"
            onClick={handleSubmit}
            disabled={loading || !productName.trim() || reviewList.length === 0}
            style={{ alignSelf: 'flex-start', minWidth: 180 }}
          >
            {loading ? <div className="spinner" /> : <Send size={15} />}
            {loading ? 'Analyzing…' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: 20 }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
      )}

      {/* Skeleton loaders */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SkeletonCard height={100} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <SkeletonCard height={200} />
            <SkeletonCard height={200} />
          </div>
          <SkeletonCard height={150} />
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Executive Summary */}
          <div className="glass-card" style={{ padding: 22 }}>
            <SectionLabel>Executive Summary</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <span style={{
                  fontSize: '3rem', fontWeight: 800,
                  color: sentLabelColor, lineHeight: 1,
                }}>
                  {confidence.toFixed(2)}
                </span>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  avg confidence
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SentimentBadge label={overallLabel} />
                <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: COLORS.positive }}>
                    ↑ {ss?.positive ?? 0}% positive
                  </span>
                  <span style={{ color: COLORS.negative }}>
                    ↓ {ss?.negative ?? 0}% negative
                  </span>
                  <span>
                    → {ss?.neutral ?? 0}% neutral
                  </span>
                </div>
              </div>
            </div>
            {/* Confidence bar */}
            <div style={{
              height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)',
              marginTop: 16, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 99,
                width: `${confidence * 100}%`,
                background: `linear-gradient(90deg, ${sentLabelColor}, ${sentLabelColor}88)`,
                transition: 'width .6s ease',
              }} />
            </div>
          </div>

          {/* LLM Insights */}
          {llmSummary && (
            <div className="glass-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <SectionLabel>AI Analyst Summary</SectionLabel>
                <CopyButton text={llmSummary} copyKey="llm" copy={copy} copied={copied} />
              </div>
              <p style={{ fontSize: '0.82rem', lineHeight: 1.75, color: '#cbd5e1', margin: 0 }}>
                {llmSummary}
              </p>
            </div>
          )}

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>

            {/* Pie chart */}
            <div className="glass-card" style={{ padding: 22 }}>
              <SectionLabel>Sentiment Distribution</SectionLabel>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80}
                    paddingAngle={3} dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b', border: '1px solid #334155',
                      borderRadius: 8, fontSize: '0.75rem',
                    }}
                    formatter={(v) => [`${v}%`]}
                  />
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Bar chart — aspects */}
            {barData.length > 0 && (
              <div className="glass-card" style={{ padding: 22 }}>
                <SectionLabel>Aspect Sentiment Breakdown</SectionLabel>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b', border: '1px solid #334155',
                        borderRadius: 8, fontSize: '0.75rem',
                      }}
                      formatter={(v) => [`${v}%`]}
                    />
                    <Bar dataKey="Positive" fill={COLORS.positive} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Negative" fill={COLORS.negative} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Keywords */}
          <div className="glass-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <SectionLabel>Key Phrases</SectionLabel>
              <CopyButton
                text={[...(result.top_positive_phrases ?? []), ...(result.top_negative_phrases ?? [])].join(', ')}
                copyKey="phrases"
                copy={copy}
                copied={copied}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {result.top_positive_phrases?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: COLORS.positive, fontWeight: 700, marginBottom: 8 }}>
                    POSITIVE SIGNALS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.top_positive_phrases.map((p, i) => (
                      <PhraseChip key={i} text={p} positive copy={copy} copied={copied} />
                    ))}
                  </div>
                </div>
              )}
              {result.top_negative_phrases?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: COLORS.negative, fontWeight: 700, marginBottom: 8 }}>
                    NEGATIVE SIGNALS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.top_negative_phrases.map((p, i) => (
                      <PhraseChip key={i} text={p} positive={false} copy={copy} copied={copied} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Aspects + Clusters row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>

            <div className="glass-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <SectionLabel>Aspect-Based Insights</SectionLabel>
                <CopyButton
                  text={aspects.map(a => `${a.aspect}: ${a.positive_pct}% pos`).join('\n')}
                  copyKey="aspects"
                  copy={copy}
                  copied={copied}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {aspects.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '20px 0' }}>
                    No aspects detected
                  </p>
                )}
                {aspects.map((a, i) => {
                  const pct = a.positive_pct ?? 0
                  const color = pct >= 50 ? COLORS.positive : COLORS.negative
                  return (
                    <div key={i} style={{
                      padding: '10px 12px', background: 'rgba(124,92,191,0.05)',
                      borderRadius: 9, border: '1px solid var(--glass-border)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{a.aspect}</span>
                        <span style={{ color, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                          {pct.toFixed(0)}% pos
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{
                          height: '100%', borderRadius: 99,
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${color}, ${color}88)`,
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="glass-card" style={{ padding: 22 }}>
              <SectionLabel>Theme Clusters</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.embedding_clusters?.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '20px 0' }}>
                    Embeddings disabled or insufficient data
                  </p>
                )}
                {result.embedding_clusters?.map((c, i) => (
                  <ClusterCard key={i} c={c} />
                ))}
              </div>
            </div>
          </div>

          {/* Contradictions */}
          {result.contradictions?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <AlertTriangle size={15} color="#fbbf24" />
                <SectionLabel>Polarised Aspects (Contradictions)</SectionLabel>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.contradictions.map((c, i) => (
                  <ContradictionCard key={i} c={c} />
                ))}
              </div>
            </div>
          )}

          {/* Entities */}
          {result.entities?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Tag size={14} color={COLORS.blue} />
                <SectionLabel>Detected Entities</SectionLabel>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {result.entities.map((e, i) => (
                  <EntityTag key={i} text={e.text} label={e.label} />
                ))}
              </div>
            </div>
          )}

          {/* POS Visualizer */}
          {result.pos_tags?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Eye size={14} color={COLORS.purple} />
                <SectionLabel>POS Tag Visualizer (first review)</SectionLabel>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, fontSize: '0.65rem' }}>
                {Object.entries(POS_COLORS).slice(0, 7).map(([pos, color]) => (
                  <span key={pos} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                    {pos}
                  </span>
                ))}
              </div>
              <div style={{ padding: '18px 0 4px' }}>
                <POSVisualizer posTags={result.pos_tags} />
              </div>
            </div>
          )}

          {/* Review-level sentiments */}
          {result.review_sentiments?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <SectionLabel>Per-Review Sentiment</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.review_sentiments.map((r, i) => {
                  const c = r.label === 'POSITIVE' ? COLORS.positive
                          : r.label === 'NEGATIVE' ? COLORS.negative
                          : COLORS.neutral
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '8px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)',
                      borderLeft: `3px solid ${c}`,
                    }}>
                      <span style={{
                        fontSize: '0.62rem', fontFamily: 'var(--font-mono)',
                        color: c, fontWeight: 700, whiteSpace: 'nowrap',
                        paddingTop: 1,
                      }}>
                        {r.label} {(r.score * 100).toFixed(0)}%
                      </span>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                        {r.text}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Raw JSON */}
          <div className="glass-card" style={{ padding: '12px 20px' }}>
            <button
              onClick={() => setShowRaw(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
              }}
            >
              {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Raw JSON Inspection
            </button>
            {showRaw && (
              <div style={{ position: 'relative', marginTop: 12 }}>
                <CopyButton
                  text={JSON.stringify(result, null, 2)}
                  copyKey="raw-json"
                  copy={copy}
                  copied={copied}
                  style={{ position: 'absolute', top: 8, right: 8 }}
                />
                <pre className="json-block" style={{ fontSize: '0.68rem', paddingTop: 36 }}>
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}