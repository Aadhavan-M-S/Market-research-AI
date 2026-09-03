import { useState } from 'react'
import { Users, Cpu, AlertCircle, ChevronDown, ChevronUp, Plus, X, ListPlus, Copy, Check } from 'lucide-react'
import { runPersonaGenerator } from '../../api/client.js'

const NLP_TECHNIQUES = [
  { label: 'Sentence-Transformers Embeddings', color: '#7c5cbf' },
  { label: 'Semantic Clustering (KMeans + Dense Vectors)', color: '#f0894a' },
  { label: 'DeBERTa Sentiment Analysis', color: '#1fe4c8' },
  { label: 'spaCy POS & Morphological Analysis', color: '#4f8ef7' },
  { label: 'RAG + LLM Persona Synthesis', color: '#e05ec9' },
]

const PERSONA_COLORS = ['#7c5cbf','#4f8ef7','#1fe4c8','#f0894a','#e05ec9']

const SAMPLE_TEXTS = [
  "I'm a senior developer who values clean code and good documentation. I use vim, brew coffee at 6am, and hate meetings.",
  "Product manager here. I think in OKRs and user stories. Always asking 'what's the impact?' and 'does data support this?'",
  "Startup founder, technical background. 80-hour weeks, obsessed with product-market fit and retention metrics.",
  "UX designer. Empathy-driven, loves Figma, hates when devs say 'that's technically not possible'.",
  "Junior dev, bootcamp grad. Learning every day. Uses Stack Overflow 20x per day, reads HN before bed.",
  "CTO at a mid-size company. Balancing tech debt and feature velocity. All about hiring A-players and system design.",
]

function Badge({ label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 100, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} /> {label}
    </span>
  )
}

// Helper component for inline copy buttons
function CopyBtn({ text, label, style = {} }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: copied ? '#10b981' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', ...style }}>
      {copied ? <Check size={12} /> : <Copy size={12} />} {label}
    </button>
  )
}

const formatPersona = (p) => `
Name: ${p.name || 'Anonymous Persona'}
Archetype: ${p.archetype || 'Unknown'}

[ DEMOGRAPHICS ]
• Age: ${p.demographics?.age_range || 'N/A'}
• Role: ${p.demographics?.occupation || 'N/A'}
• Tech Fluency: ${p.demographics?.tech_level || 'N/A'}

[ GOALS ]
${(p.goals || []).map(g => `• ${g}`).join('\n')}

[ PAIN POINTS ]
${(p.pain_points || []).map(pp => `• ${pp}`).join('\n')}

[ PSYCHOGRAPHICS & VALUES ]
• Motivations: ${(p.psychographics?.motivations || []).join(', ')}
• Core Values: ${(p.psychographics?.values || []).join(', ')}
• Sentiment Positivity: ${p.psychographics?.positive_sentiment_ratio !== undefined ? Math.round(p.psychographics.positive_sentiment_ratio * 100) : 0}%

[ REPRESENTATIVE QUOTE ]
"${p.representative_quote || ''}"
`.trim()

export default function PersonaGenerator() {
  const [bulkText, setBulkText]   = useState('')
  const [samples, setSamples]     = useState([])
  const [nPersonas, setNPersonas] = useState(3)
  const [context, setContext]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [showRaw, setShowRaw]     = useState(false)
  const [toast, setToast]         = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const parseBulkText = () => {
    if (!bulkText.trim()) return
    const parsed = bulkText
      .split(/\n/)
      .map(s => s.replace(/(Customer Interview \d+:|Survey Response:|Support Ticket.*?:)/ig, '').trim())
      .filter(s => s.length > 0)
    setSamples(parsed)
  }

  const remove = i => setSamples(s => s.filter((_, idx) => idx !== i))
  const update = (i, v) => setSamples(s => s.map((x, idx) => idx === i ? v : x))

  const handleLoadSamples = () => {
    const text = SAMPLE_TEXTS.join('\n\n')
    setBulkText(text)
    setSamples(SAMPLE_TEXTS)
  }

  const handleSubmit = async () => {
    const valid = samples.filter(s => s.trim())
    if (!valid.length) return
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await runPersonaGenerator({ 
        raw_text_samples: valid, 
        n_personas: Number(nPersonas), 
        context: context.trim() || undefined 
      })
      setResult(data)
    } catch (err) { 
      const msg = typeof err.message === 'string' ? err.message : JSON.stringify(err.message)
      setError(msg) 
    }
    finally { setLoading(false) }
  }

  const copyAllPersonas = () => {
    if (!result?.personas) return
    const fullText = result.personas.map(formatPersona).join('\n\n' + '='.repeat(40) + '\n\n')
    navigator.clipboard.writeText(fullText)
    showToast("All personas copied to clipboard!")
  }

  return (
    <div className="agent-page">
      {/* Toast Notification Overlay */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--bg-elevated)', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 8, animation: 'fadeInUp 0.2s ease' }}>
          <Check size={16} color="#10b981" /> <span style={{ fontSize: '0.85rem' }}>{toast}</span>
        </div>
      )}

      {/* Header Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(124,92,191,0.12)', border: '1px solid rgba(124,92,191,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={20} color="#7c5cbf" />
        </div>
        <h1 className="agent-page__title" style={{ background: 'linear-gradient(135deg,#7c5cbf,#e05ec9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Persona Generator</h1>
      </div>
      <p className="agent-page__subtitle">
  Dense semantic clustering, DeBERTa-based sentiment modeling, spaCy-powered linguistic analysis, and RAG-grounded LLM synthesis to generate high-fidelity, actionable user personas from unstructured text.
</p>

      <div className="hood-panel" style={{ marginBottom: 24 }}>
        <div className="hood-panel__header"><Cpu size={13} color="#7c5cbf" style={{ marginRight: 4 }} />Active NLP Techniques</div>
        <div className="hood-panel__badges">{NLP_TECHNIQUES.map(t => <Badge key={t.label} {...t} />)}</div>
      </div>

      {/* Inputs Form Section */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="agent-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Number of Personas</label>
              <input className="glass-input" type="number" min={1} max={10} value={nPersonas} onChange={e => setNPersonas(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Context (optional)</label>
              <input className="glass-input" placeholder="e.g. SaaS, Healthcare, Gaming" value={context} onChange={e => setContext(e.target.value)} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Bulk Dataset Dump</label>
              <button onClick={handleLoadSamples} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Load tech industry samples</button>
            </div>
            <textarea 
              className="glass-input" 
              placeholder="Paste your raw user reviews, feedback, or interview transcripts here..." 
              value={bulkText} 
              onChange={e => setBulkText(e.target.value)} 
              rows={4} 
              style={{ resize: 'vertical', marginBottom: 12 }} 
            />
            <button onClick={parseBulkText} className="glass-btn glass-btn--ghost" disabled={!bulkText.trim()} style={{ alignSelf: 'flex-start', padding: '7px 14px', fontSize: '0.78rem' }}>
              <ListPlus size={14} /> Extract & Parse Sentences
            </button>
          </div>

          {samples.length > 0 && (
            <div className="form-group" style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Parsed Preview ({samples.length} records ready)</label>
                <button onClick={() => setSamples([])} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>Clear List</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
                {samples.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', width: 16, textAlign: 'right' }}>{i+1}.</div>
                    <input className="glass-input" value={s} onChange={e => update(i, e.target.value)} style={{ padding: '6px 12px', fontSize: '0.85rem' }} />
                    <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="glass-btn" onClick={handleSubmit} disabled={loading || !samples.filter(s => s.trim()).length} style={{ alignSelf: 'flex-start', marginTop: 8, background: 'linear-gradient(135deg,rgba(124,92,191,0.25),rgba(224,94,201,0.2))', borderColor: 'rgba(124,92,191,0.4)' }}>
            {loading ? <><div className="spinner" />Generating personas…</> : <><Users size={15} />Generate Personas</>}
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 20 }}><AlertCircle size={16} /><span>{error}</span></div>}

      {/* Results Section */}
      {result?.personas?.length > 0 && (
        <div className="results-container">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="glass-btn glass-btn--ghost" onClick={copyAllPersonas} style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
              <Copy size={14} /> Copy All Personas
            </button>
          </div>

          {result.personas.map((p, i) => {
            const color = PERSONA_COLORS[i % PERSONA_COLORS.length]
            return (
              <div key={i} className="glass-card" style={{ padding: 24, borderColor: `${color}20`, animation: `fadeInUp ${0.3 + i * 0.1}s ease both` }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${color}20`, border: `2px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color, flexShrink: 0 }}>
                      {(p?.name || `P${i+1}`)[0]}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: 2 }}>{p?.name || `Persona ${i + 1}`}</div>
                      {p?.archetype && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color, letterSpacing: '0.05em' }}>{p.archetype}</div>}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <CopyBtn text={formatPersona(p)} label="Copy Summary" />
                    <CopyBtn text={JSON.stringify(p, null, 2)} label="JSON" />
                  </div>
                </div>

                {p?.representative_quote && (
                  <blockquote style={{ fontSize: '0.88rem', fontStyle: 'italic', color: 'var(--text-secondary)', borderLeft: `2px solid ${color}60`, paddingLeft: 10, margin: '0 0 16px 0' }}>
                    "{p.representative_quote}"
                  </blockquote>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  
                  {p?.demographics && (
                    <div style={{ padding: '10px 12px', background: `${color}08`, borderRadius: 8, border: `1px solid ${color}18` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Demographics</div>
                      </div>
                      {p.demographics?.age_range && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2 }}>• Age: {p.demographics.age_range}</div>}
                      {p.demographics?.occupation && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2 }}>• Role: {p.demographics.occupation}</div>}
                      {p.demographics?.tech_level && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>• Tech: {p.demographics.tech_level}</div>}
                    </div>
                  )}

                  {p?.goals?.length > 0 && (
                    <div style={{ padding: '10px 12px', background: `${color}08`, borderRadius: 8, border: `1px solid ${color}18`, position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                         <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goals</div>
                         <CopyBtn text={p.goals.join('\n')} label="" style={{ color }} />
                      </div>
                      {p.goals.map((g, j) => <div key={j} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2 }}>• {g}</div>)}
                    </div>
                  )}

                  {p?.pain_points?.length > 0 && (
                    <div style={{ padding: '10px 12px', background: 'rgba(240,128,128,0.06)', borderRadius: 8, border: '1px solid rgba(240,128,128,0.15)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                         <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f08080', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pain Points</div>
                         <CopyBtn text={p.pain_points.join('\n')} label="" style={{ color: '#f08080' }} />
                      </div>
                      {p.pain_points.map((pp, j) => <div key={j} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2 }}>• {pp}</div>)}
                    </div>
                  )}
                  
                  {p?.psychographics && (
                    <div style={{ padding: '10px 12px', background: `${color}08`, borderRadius: 8, border: `1px solid ${color}18` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Psychographics</div>
                        <CopyBtn text={`Values: ${(p.psychographics.values || []).join(', ')}\nMotivations: ${(p.psychographics.motivations || []).join(', ')}\nPositivity: ${Math.round((p.psychographics.positive_sentiment_ratio || 0) * 100)}%`} label="" style={{ color }} />
                      </div>
                      {p.psychographics?.values?.length > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2 }}>• Values: {p.psychographics.values.join(', ')}</div>}
                      {p.psychographics?.motivations?.length > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2 }}>• Motivations: {p.psychographics.motivations.join(', ')}</div>}
                      {p.psychographics?.positive_sentiment_ratio !== undefined && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>• Positivity: {Math.round(p.psychographics.positive_sentiment_ratio * 100)}%</div>}
                    </div>
                  )}

                  {p?.language_style && (
                    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Language Style</div>
                        <CopyBtn text={`Formality: ${p.language_style.formality || 'N/A'}\nAvg Words/Sent: ${p.language_style.avg_sentence_length || 'N/A'}`} label="" style={{ color: 'var(--text-muted)' }} />
                      </div>
                      {p.language_style?.formality && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2, textTransform: 'capitalize' }}>• Formality: {p.language_style.formality}</div>}
                      {p.language_style?.avg_sentence_length !== undefined && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>• Avg Words/Sent: {p.language_style.avg_sentence_length}</div>}
                    </div>
                  )}

                </div>
              </div>
            )
          })}

          <div className="glass-card" style={{ padding: '14px 20px', marginTop: '16px' }}>
            <button onClick={() => setShowRaw(!showRaw)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', width: '100%' }}>
              {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Raw Response JSON
            </button>
            {showRaw && <pre className="json-block" style={{ marginTop: 12 }}>{JSON.stringify(result, null, 2)}</pre>}
          </div>
        </div>
      )}
    </div>
  )
}