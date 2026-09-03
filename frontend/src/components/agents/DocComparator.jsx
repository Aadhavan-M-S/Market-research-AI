import { useState } from 'react'
import { FileText, Cpu, AlertCircle, ChevronDown, ChevronUp, CheckCircle, XCircle, Minus } from 'lucide-react'
import { runDocComparator } from '../../api/client.js'

const NLP_TECHNIQUES = [
  { label: 'Sentence Transformers (Dense Similarity)', color: '#7c5cbf' },
  { label: 'BERTScore-style Alignment', color: '#4f8ef7' },
  { label: 'FAISS-based RAG Retrieval', color: '#1fe4c8' },
  { label: 'NER + Feature Extraction', color: '#f0894a' },
  { label: 'DeBERTa Sentiment (Pros/Cons)', color: '#ff6b6b' },
  { label: 'Argument Mining (Claims & Obligations)', color: '#ffd166' },
  { label: 'Abstractive Summarization (DL)', color: '#6ee7b7' },
]
const parseVerdict = (text) => {
  const sections = {
    overall: "",
    differentiators: [],
    gaps: [],
    impact: []
  };

  const lines = text.split("\n");

  let current = null;

  for (let line of lines) {
    line = line.trim();

    if (line.includes("OVERALL ASSESSMENT")) current = "overall";
    else if (line.includes("KEY DIFFERENTIATORS")) current = "diff";
    else if (line.includes("GAPS")) current = "gaps";
    else if (line.includes("PRACTICAL IMPACT")) current = "impact";
    else if (line.startsWith("*")) {
      const clean = line.replace("*", "").trim();
      if (current === "diff") sections.differentiators.push(clean);
      if (current === "gaps") sections.gaps.push(clean);
      if (current === "impact") sections.impact.push(clean);
    } else if (current === "overall" && line) {
      sections.overall += line + " ";
    }
  }

  return sections;
};

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px',
      background: `${color}14`, border: `1px solid ${color}30`,
      borderRadius: 100, fontFamily: 'var(--font-mono)',
      fontSize: '0.72rem', color, letterSpacing: '0.03em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

export default function DocComparator() {
  const [labelA, setLabelA]       = useState('')
  const [textA, setTextA]         = useState('')
  const [labelB, setLabelB]       = useState('')
  const [textB, setTextB]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [showRaw, setShowRaw]     = useState(false)

  const handleSubmit = async () => {
    if (!textA.trim() || !textB.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await runDocComparator({
  doc_a: textA.trim(),
  label_a: labelA || 'Document A',
  doc_b: textB.trim(),
  label_b: labelB || 'Document B',
})
      setResult(data)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const la = labelA || 'Doc A'
  const lb = labelB || 'Doc B'

  return (
    <div className="agent-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(124,92,191,0.12)', border: '1px solid rgba(124,92,191,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={20} color="#7c5cbf" />
        </div>
        <h1 className="agent-page__title" style={{ background: 'linear-gradient(135deg,#7c5cbf,#b89bef)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Doc Comparator
        </h1>
      </div>
      <p className="agent-page__subtitle">
  Advanced document comparison using dense semantic similarity, RAG-based retrieval, feature gap analysis, argument mining, and LLM-powered reasoning to identify key differences and insights between documents.
</p>

      <div className="hood-panel" style={{ marginBottom: 24 }}>
        <div className="hood-panel__header"><Cpu size={13} color="#7c5cbf" style={{ marginRight: 4 }} />Active NLP Techniques</div>
        <div className="hood-panel__badges">
          {NLP_TECHNIQUES.map(t => <Badge key={t.label} {...t} />)}
        </div>
      </div>

      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
          {[
            { label: labelA, setLabel: setLabelA, text: textA, setText: setTextA, placeholder: 'Document A label', side: 'A', color: '#4f8ef7' },
            { label: labelB, setLabel: setLabelB, text: textB, setText: setTextB, placeholder: 'Document B label', side: 'B', color: '#7c5cbf' },
          ].map(({ label, setLabel, text, setText, placeholder, side, color }) => (
            <div key={side} className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: `${color}18`, border: `1px solid ${color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color, fontWeight: 700 }}>{side}</div>
                <input className="glass-input" placeholder={placeholder} value={label} onChange={e => setLabel(e.target.value)} style={{ padding: '6px 12px', fontSize: '0.82rem' }} />
              </div>
              <textarea className="glass-input" placeholder={`Paste the full text of Document ${side}...`} value={text} onChange={e => setText(e.target.value)} rows={8} />
            </div>
          ))}
        </div>
        <button className="glass-btn" onClick={handleSubmit} disabled={loading || !textA.trim() || !textB.trim()} style={{ background: 'linear-gradient(135deg,rgba(124,92,191,0.25),rgba(79,142,247,0.2))', borderColor: 'rgba(124,92,191,0.4)' }}>
          {loading ? <><div className="spinner" />Comparing documents…</> : <><FileText size={15} />Compare Documents</>}
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 20 }}><AlertCircle size={16} /><span>{error}</span></div>}

      {result && (() => {
        const verdict = parseVerdict(result.llm_verdict || '');
        return (
        <div className="results-container">
          {/* Feature comparison table */}
          {result.comparison && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 14 }}>Feature Gap Analysis · TF-IDF VSM</span>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 0, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                {['Feature', la, lb].map((h, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--glass-border)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
                ))}
                {result.comparison.map((row, i) => (
                  [row.feature, row.in_a, row.in_b].map((cell, j) => (
                    <div key={`${i}-${j}`} style={{ padding: '10px 14px', borderBottom: i < result.comparison.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', fontSize: j === 0 ? '0.85rem' : '0.9rem', color: j === 0 ? 'var(--text-primary)' : undefined, display: 'flex', alignItems: 'center' }}>
                      {j === 0 ? cell : (
                        cell === true ? <CheckCircle size={15} color="#1fe4c8" /> :
                        cell === false ? <XCircle size={15} color="#f08080" /> :
                        typeof cell === 'number' ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#7ab3ff' }}>{cell.toFixed(2)}</span> :
                        <Minus size={14} color="var(--text-muted)" />
                      )}
                    </div>
                  ))
                ))}
              </div>
            </div>
          )}

          {/* Summaries side by side */}
          {(result.summary_a || result.summary_b) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[{ s: result.summary_a, label: la, color: '#4f8ef7' }, { s: result.summary_b, label: lb, color: '#7c5cbf' }].map(({ s, label, color }) => s && (
                <div key={label} className="glass-card" style={{ padding: 20, borderColor: `${color}20` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{label} Summary</div>
                  <p style={{ fontSize: '0.85rem', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{s}</p>
                </div>
              ))}
            </div>
          )}
          {/* LLM Verdict */}
<div className="glass-card" style={{ padding: 22 }}>
  <span className="section-label">🔍 AI Comparative Analysis</span>

  {/* OVERALL */}
  <div style={{ marginTop: 16 }}>
    <h3 style={{ color: '#ffd700', fontSize: '0.9rem' }}>Overall Assessment</h3>
    <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
      {verdict.overall}
    </p>
  </div>

  {/* DIFFERENTIATORS */}
  <div style={{ marginTop: 16 }}>
    <h3 style={{ color: '#7ab3ff', fontSize: '0.9rem' }}>Key Differentiators</h3>
    <ul>
      {verdict.differentiators.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  </div>

  {/* GAPS */}
  <div style={{ marginTop: 16 }}>
    <h3 style={{ color: '#ff8a8a', fontSize: '0.9rem' }}>Gaps & Weaknesses</h3>
    <ul>
      {verdict.gaps.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  </div>

  {/* IMPACT */}
  <div style={{ marginTop: 16 }}>
    <h3 style={{ color: '#1fe4c8', fontSize: '0.9rem' }}>Practical Impact</h3>
    <ul>
      {verdict.impact.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  </div>
</div>


          {/* Similarity score */}
          {result.similarity_score != null && (
            <div className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="section-label">Cosine Similarity (TF-IDF)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#7ab3ff', fontWeight: 600 }}>{(result.similarity_score * 100).toFixed(1)}%</span>
              </div>
              <div className="score-bar"><div className="score-bar__fill" style={{ width: `${result.similarity_score * 100}%` }} /></div>
            </div>
          )}

          {/* Morphological insights */}
          {result.morphological_insights && (
            <div className="glass-card" style={{ padding: 20, borderColor: 'rgba(31,228,200,0.15)' }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 10 }}>Morphological Analysis</span>
              <p style={{ fontSize: '0.87rem', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{typeof result.morphological_insights === 'string' ? result.morphological_insights : JSON.stringify(result.morphological_insights)}</p>
            </div>
          )}

          <div className="glass-card" style={{ padding: '14px 20px' }}>
            <button onClick={() => setShowRaw(!showRaw)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', width: '100%' }}>
              {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Raw Response JSON
            </button>
            {showRaw && <pre className="json-block" style={{ marginTop: 12 }}>{JSON.stringify(result, null, 2)}</pre>}
          </div>
        </div>
        );
      })()}
    </div>
  )
}
