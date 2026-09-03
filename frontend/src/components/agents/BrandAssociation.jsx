import { useState } from 'react'
import { Zap, Cpu, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { runBrandAssociation } from '../../api/client.js'
import { useMemo } from 'react'
const NLP_TECHNIQUES = [
  { label: "Hybrid RAG (FAISS + BM25)", color: "#7c5cbf" },
  { label: "Sentence Transformers", color: "#4f8ef7" },
  { label: "DeBERTa Sentiment", color: "#1fe4c8" },
  { label: "Cross-Encoder Re-ranking", color: "#e05ec9" },
  { label: "TF-IDF + Dense VSM", color: "#7c5cbf" },
  { label: "N-gram Modeling", color: "#4f8ef7" },
  { label: "Thematic Role Analysis", color: "#1fe4c8" }
]

function Badge({ label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 100, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} /> {label}
    </span>
  )
}

export default function BrandAssociation() {
  const [brand, setBrand]             = useState('')
  const [corpus, setCorpus]           = useState('')
  const [competitors, setCompetitors] = useState('')
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState(null)
  const [error, setError]             = useState(null)
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw]         = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleSubmit = async () => {
    if (!brand.trim() || !corpus.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await runBrandAssociation({
        brand: brand.trim(),
        corpus: corpus
          .split(/[\n\.]+/) 
          .map(c => c.trim())
          .filter(c => c.length > 0),
        competitor_brands: competitors
          .split(',')
          .map(c => c.trim())
          .filter(Boolean),
        
      })
      setResult(data)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
 const previewChunks = useMemo(() => {
  return corpus
    .split(/[\n\.]+/)
    .map(c => c.trim())
    .filter(Boolean);
}, [corpus]);

  return (
    <div className="agent-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(224,94,201,0.12)', border: '1px solid rgba(224,94,201,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={20} color="#e05ec9" />
        </div>
        <h1 className="agent-page__title" style={{ background: 'linear-gradient(135deg,#e05ec9,#7c5cbf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Brand Association</h1>
      </div>
      <p className="agent-page__subtitle">RAG-powered semantic mapping using sentence-transformers, DeBERTa sentiment analysis, cross-encoder ranking, and hybrid TF-IDF + dense embeddings to uncover brand perception and competitive positioning.</p>

      <div className="hood-panel" style={{ marginBottom: 24 }}>
        <div className="hood-panel__header"><Cpu size={13} color="#e05ec9" style={{ marginRight: 4 }} />Active NLP Techniques</div>
        <div style={{
  fontSize: '0.65rem',
  color: '#888',
  marginBottom: 8
}}>
  Input is split into sentences → used for RAG retrieval, sentiment, and semantic analysis
</div>
        <div className="hood-panel__badges">{NLP_TECHNIQUES.map(t => <Badge key={t.label} {...t} />)}</div>
      </div>

      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="agent-form">
          <div className="form-group">
            <label className="form-label">Brand Name</label>
            <input className="glass-input" placeholder="e.g. Notion" value={brand} onChange={e => setBrand(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Competitors (comma-separated)</label>
            <input className="glass-input" placeholder="e.g. Obsidian, Roam Research, Confluence" value={competitors} onChange={e => setCompetitors(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Corpus (brand mentions, reviews, articles)</label>
            <textarea className="glass-input" placeholder="Paste text corpus containing brand mentions and market discourse…" value={corpus} onChange={e => setCorpus(e.target.value)} rows={7} />
              {corpus.trim().length > 0 && (
  <div style={{
    marginTop: 12,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 8
  }}>
    
    <div style={{
      fontSize: '0.7rem',
      color: '#e05ec9',
      marginBottom: 8,
      fontFamily: 'var(--font-mono)',
      textTransform: 'uppercase'
    }}>
      Processing Preview ({previewChunks.length} chunks · sentence-level splitting)
    </div>

    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maxHeight: 140,
      overflow: 'auto'
    }}>
      {previewChunks.slice(0, 10).map((chunk, i) => (
        <div key={i} style={{
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          padding: '6px 10px',
          background: 'rgba(124,92,191,0.08)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)'
        }}>
          {chunk}
        </div>
      ))}
    </div>

    {previewChunks.length > 10 && (
      <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 6 }}>
        Showing first 10 of {previewChunks.length} chunks
      </div>
    )}

  </div>
)}
          </div>
          <button className="glass-btn" onClick={handleSubmit} disabled={loading || !brand.trim() || !corpus.trim()} style={{ alignSelf: 'flex-start', background: 'linear-gradient(135deg,rgba(224,94,201,0.25),rgba(124,92,191,0.2))', borderColor: 'rgba(224,94,201,0.4)' }}>
            {loading ? <><div className="spinner" />Analysing Brand…</> : <><Zap size={15} />Analyse Brand</>}
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 20 }}><AlertCircle size={16} /><span>{error}</span></div>}

      {result && (
        <div className="results-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* PRIMARY: Semantic Map */}
          {result.semantic_map?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 14 }}>Semantic Map · Dense + Sparse</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {result.semantic_map.map((item, i) => {
                  const score = item.combined_score ?? 0;
                  const normalized = Math.min(score, 1);
                  const opacity = normalized * 0.8 + 0.2;
                  return (
                    <div key={i} style={{ padding: '8px 12px', background: `rgba(224,94,201,${normalized * 0.15})`, border: '1px solid rgba(224,94,201,0.2)', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: `rgba(232,141,218,${opacity})`, fontWeight: 600 }}>{item.word}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 3 }}>Score: {score.toFixed(3)}</div>
                      <div style={{ fontSize: '0.6rem', color: '#888', marginTop: 2 }}>
                            Sim: {item.semantic_similarity?.toFixed(2)}
                          </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* INSIGHT: Brand Signal Strength */}
          {result.association_strength && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 14 }}>Brand Signal Strength</span>
              
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-display)' }}>{result.association_strength?.mentions ?? 0}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Total Mentions</div>
                </div>
                <div style={{ flex: 1, padding: 16, background: 'rgba(31,228,200,0.05)', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(31,228,200,0.1)' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1fe4c8', fontFamily: 'var(--font-display)' }}>{result.association_strength?.positive_pct ?? 0}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Positive Sentiment</div>
                </div>
                <div style={{ flex: 1, padding: 16, background: 'rgba(255,99,112,0.05)', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(255,99,112,0.1)' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ff6370', fontFamily: 'var(--font-display)' }}>{result.association_strength?.negative_pct ?? 0}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Negative Sentiment</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 100 }}>Semantic Terms:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.association_strength.semantic_terms?.map((term, i) => (
                      <span key={i} style={{ padding: '3px 10px', background: 'rgba(124,92,191,0.15)', borderRadius: 100, fontSize: '0.75rem', color: '#b89bef', fontFamily: 'var(--font-mono)' }}>{term}</span>
                    ))}
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 100 }}>Top N-grams:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.association_strength.top_ngrams?.map((ngram, i) => (
                      <span key={i} style={{ padding: '3px 10px', background: 'rgba(79,142,247,0.15)', borderRadius: 100, fontSize: '0.75rem', color: '#82b4ff', fontFamily: 'var(--font-mono)' }}>{ngram}</span>
                    ))}
                  </div>
                </div>
              </div>

              {result.association_strength.llm_narrative && (
                <div style={{ marginTop: 20, padding: 16, background: 'rgba(224,94,201,0.05)', borderLeft: '3px solid #e05ec9', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#e05ec9', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategic Narrative</div>
                  <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {result.association_strength.llm_narrative}
                  </div>
                </div>
              )}
            </div>
          )}
          

          {/* ANALYTICAL: Competitor Comparison */}
        {result.competitor_comparison?.length > 0 && (
  <div className="glass-card" style={{ padding: 22 }}>
    
    <span className="section-label" style={{ display: 'block', marginBottom: 14 }}>
      Competitor Comparison · Prominence
    </span>

    {/* ✅ DEFINE HERE */}
    {(() => {
      const maxScore = Math.max(
        ...result.competitor_comparison.map(c => c.prominence_score),
        1
      );

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result.competitor_comparison.map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>{c.brand}</span>

               <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 100 }}>
  <div
    style={{
      height: 6,
      width: `${(c.prominence_score / maxScore) * 100}%`,
      background: 'linear-gradient(90deg,#e05ec9,#7c5cbf)',
      borderRadius: 100,
    }}
  />
</div>

                <span>{c.prominence_score.toFixed(2)}</span>
              </div>

            </div>
          ))}
        </div>
      );
    })()}

  </div>
)}
          {/* Thematic Roles */}
          {result.thematic_roles?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 14 }}>Thematic Role Analysis</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.thematic_roles.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'rgba(255,255,255,0.015)', padding: '12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#1fe4c8', minWidth: 100, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.predicate}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {(item.arguments || []).map((arg, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', background: 'rgba(31,228,200,0.08)', border: '1px solid rgba(31,228,200,0.15)', borderRadius: 100, fontSize: '0.75rem' }}>
                          <span style={{ color: '#0eb59e', marginRight: 6, fontWeight: 500 }}>{arg.role}:</span>
                          <span style={{ color: '#a0f2e5' }}>{arg.filler}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key TF-IDF Terms */}
          {result.vsm_top_terms?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 14 }}>Key TF-IDF Terms</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.vsm_top_terms.map((t, i) => (
                  <div key={i} style={{ padding: '6px 12px', background: 'rgba(124,92,191,0.1)', border: '1px solid rgba(124,92,191,0.2)', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.8rem', color: '#d1c4e9' }}>{t.term}</span>
                    {t.score != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#8a6bbb' }}>{t.score.toFixed(3)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON Toggle */}
          <div className="glass-card" style={{ padding: '14px 20px' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <button onClick={() => setShowRaw(!showRaw)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
      {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Raw Response JSON
    </button>

    {showRaw && (
      <button onClick={handleCopy} style={{ fontSize: '0.7rem', color: '#e05ec9', cursor: 'pointer', border: 'none', background: 'none' }}>
        {copied ? "Copied!" : "Copy JSON"}
      </button>
    )}
  </div>

  {showRaw && (
    <pre
  className="json-block"
  style={{
    marginTop: 12,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    userSelect: 'all',
    cursor: 'text'
  }}
>
      {JSON.stringify(result, null, 2)}
    </pre>
  )}
</div>
        </div>
      )}
    </div>
  )
}