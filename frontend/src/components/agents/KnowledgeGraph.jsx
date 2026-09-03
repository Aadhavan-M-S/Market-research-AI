import React, { useState, useMemo } from 'react';
import { GitBranch, Cpu, AlertCircle, ChevronDown, ChevronUp, Copy, Check, Network, LayoutGrid, Clock, FileText } from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';
import { runKnowledgeGraph } from '../../api/client.js';

const NLP_TECHNIQUES = [
  { label: 'NER (Ensemble)', color: '#4f8ef7' },
  { label: 'Dependency Parsing', color: '#1fe4c8' },
  { label: 'Dense Clustering', color: '#7c5cbf' },
  { label: 'Semantic Edges', color: '#f0894a' },
  { label: 'RAG Co-occurrence', color: '#e44a7a' },
];

function Badge({ label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 100, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color, letterSpacing: '0.03em' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} /> {label}
    </span>
  );
}

const SAMPLE = `OpenAI released GPT-4 in March 2023. Microsoft invested $10 billion in OpenAI. 
Sam Altman is the CEO of OpenAI and previously worked at Y Combinator. 
Google DeepMind competes with OpenAI in the AI research space. 
Anthropic, founded by Dario Amodei, developed Claude as an alternative.`;

const NODE_COLORS = {
  ORG: '#4f8ef7',
  PERSON: '#f0894a',
  GPE: '#1fe4c8',
  DATE: '#7c5cbf',
  CONCEPT: '#e44a7a',
  DEFAULT: '#8a96b0'
};

export default function KnowledgeGraph() {
  const [text, setText] = useState('');
  const [maxNodes, setMaxNodes] = useState(20);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setLoading(true); 
    setError(null); 
    setResult(null);
    try {
      const data = await runKnowledgeGraph({ 
        text: text.trim(), 
        max_nodes: Number(maxNodes) 
      });
      setResult(data);
    } catch (err) { 
      setError(err.message); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Derive simple sentences for input preview
  const previewSentences = useMemo(() => {
    if (!text.trim()) return [];
    return text.match(/[^.!?]+[.!?]+/g) || [text].filter(Boolean);
  }, [text]);

  // Transform data for react-force-graph
  const graphData = useMemo(() => {
    if (!result || !result.nodes || !result.edges) return { nodes: [], links: [] };
    return {
      nodes: result.nodes.map(n => ({
        id: n.id,
        name: n.label,
        val: n.weight,
        group: n.type
      })),
      links: result.edges.map(e => ({
        source: e.source,
        target: e.target,
        label: e.relation,
        weight: e.weight
      }))
    };
  }, [result]);

  return (
    <div className="agent-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Network size={20} color="#4f8ef7" />
        </div>
        <h1 className="agent-page__title gradient-text">Knowledge Graph</h1>
      </div>
      <p className="agent-page__subtitle">Extracts semantic entities, dependency relations, and dense clusters to build a structured network graph.</p>

      <div className="hood-panel" style={{ marginBottom: 24 }}>
        <div className="hood-panel__header"><Cpu size={13} color="#4f8ef7" style={{ marginRight: 4 }} />Active Backend Engine</div>
        <div className="hood-panel__badges">{NLP_TECHNIQUES.map(t => <Badge key={t.label} {...t} />)}</div>
      </div>

      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="agent-form">
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Input Text</label>
              <button onClick={() => setText(SAMPLE)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Load sample</button>
            </div>
            <textarea className="glass-input" placeholder="Paste any text to extract its knowledge graph…" value={text} onChange={e => setText(e.target.value)} rows={7} />
          </div>

          {previewSentences.length > 0 && (
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: 8, marginBottom: 16 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><FileText size={14} /> Input Segmentation Preview (First 10 Chunks)</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {previewSentences.slice(0, 10).map((s, i) => (
                  <span key={i} style={{ fontSize: '0.7rem', color: '#a0aabf', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 4 }}>
                    {s.trim().substring(0, 40)}{s.length > 40 ? '...' : ''}
                  </span>
                ))}
                {previewSentences.length > 10 && <span style={{ fontSize: '0.7rem', color: '#a0aabf', padding: '4px 8px' }}>+ {previewSentences.length - 10} more</span>}
              </div>
            </div>
          )}

          <div className="form-group" style={{ maxWidth: 200 }}>
            <label className="form-label">Max Nodes (Graph Size)</label>
            <input className="glass-input" type="number" min={5} max={100} value={maxNodes} onChange={e => setMaxNodes(e.target.value)} />
          </div>
          <button className="glass-btn" onClick={handleSubmit} disabled={loading || !text.trim()} style={{ alignSelf: 'flex-start' }}>
            {loading ? <><div className="spinner" />Building graph…</> : <><GitBranch size={15} />Generate Graph</>}
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 20 }}><AlertCircle size={16} /><span>{error}</span></div>}

      {result && (
        <div className="results-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Visual Graph View */}
          {graphData.nodes.length > 0 && (
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--glass-border)' }}>
                <span className="section-label" style={{ margin: 0 }}>Knowledge Graph Visualization</span>
              </div>
              <div style={{ height: 750, width: '100%', background: '#0a0d14' }}>
                <ForceGraph2D
                  graphData={graphData}
                  nodeLabel="name"
                  linkLabel="label"
                  linkColor={() => 'rgba(234, 179, 8, 0.6)'}
                  linkWidth={link => Math.max(link.weight * 2, 1)}
                  linkOpacity={0.8}
                  linkDirectionalParticles={2}
                  linkDirectionalParticleWidth={2}
                  linkDirectionalParticleColor={() => '#EAB308'}
                  nodeAutoColorBy="group"
                  nodeRelSize={6}
                  cooldownTicks={100} 
                  nodeColor={node => NODE_COLORS[node.group] || NODE_COLORS.DEFAULT}
                  linkDirectionalParticleSpeed={d => d.weight * 0.01}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.name;
                    const fontSize = 12 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    const textWidth = ctx.measureText(label).width;
                    const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); 

                    ctx.fillStyle = 'rgba(10, 13, 20, 0.8)';
                    ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, ...bckgDimensions);

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = NODE_COLORS[node.group] || NODE_COLORS.DEFAULT;
                    ctx.fillText(label, node.x, node.y);

                    node.__bckgDimensions = bckgDimensions; 
                  }}
                  nodePointerAreaPaint={(node, color, ctx) => {
                    ctx.fillStyle = color;
                    const bckgDimensions = node.__bckgDimensions;
                    bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, ...bckgDimensions);
                  }}
                />
              </div>
            </div>
          )}

          {/* Graph Statistics */}
          {result.nlp_meta && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 16 }}><Clock size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }}/> Graph Statistics</span>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div className="stat-pill">
                  <span className="stat-pill__num">{result.nodes?.length || 0}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Nodes Extracted</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill__num">{result.edges?.length || 0}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Edges Formed</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill__num">{result.nlp_meta.sentences}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Sentences Analysed</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill__num">{result.nlp_meta.tokens}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Tokens Processed</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill__num">{result.nlp_meta.processing_time_ms.toFixed(0)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Time (ms)</span>
                </div>
              </div>
            </div>
          )}

          {/* Clusters */}
          {result.clusters?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 16 }}><LayoutGrid size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} /> Dense Embeddings Clusters</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {result.clusters.map((cluster, i) => (
                  <div key={i} style={{ padding: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: 8 }}>
                    <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#7c5cbf', marginBottom: 8, textTransform: 'uppercase' }}>
                      {cluster.cluster_id} <span style={{ opacity: 0.5 }}>· {cluster.type}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {cluster.members.map((member, j) => (
                        <span key={j} style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6, fontSize: '0.75rem', color: '#e2e8f0' }}>
                          {member}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nodes List */}
          {result.nodes?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 12 }}>Entities Catalog</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.nodes.map((n, i) => {
                  const c = NODE_COLORS[n.type] || NODE_COLORS.DEFAULT;
                  return (
                    <span key={i} style={{ padding: '6px 12px', background: `${c}12`, border: `1px solid ${c}30`, borderRadius: 8, fontSize: '0.82rem', color: c, fontFamily: 'var(--font-mono)' }}>
                      {n.label}
                      <span style={{ opacity: 0.6, fontSize: '0.65rem', marginLeft: 6 }}>{n.type}</span>
                      <span style={{ opacity: 0.4, fontSize: '0.65rem', marginLeft: 6 }}>w:{n.weight.toFixed(1)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edges List */}
          {result.edges?.length > 0 && (
            <div className="glass-card" style={{ padding: 22 }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 12 }}>Relations Log</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.edges.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#7ab3ff', width: '30%', textAlign: 'right' }}>{e.source}</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 150 }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#1fe4c8', padding: '2px 8px', background: 'rgba(31,228,200,0.08)', borderRadius: 100, whiteSpace: 'nowrap' }}>
                        {e.relation} ({e.weight.toFixed(2)})
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#7ab3ff', width: '30%' }}>{e.target}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON Configurable Output */}
          <div className="glass-card" style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setShowRaw(!showRaw)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Raw Response JSON
              </button>
              {showRaw && (
                <button onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  {copied ? <Check size={14} color="#1fe4c8" /> : <Copy size={14} />} 
                  {copied ? 'Copied!' : 'Copy JSON'}
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
                  maxHeight: '400px',
                  overflowY: 'auto',
                  padding: '16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '6px'
                }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}