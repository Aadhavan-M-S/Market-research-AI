import { useState, useEffect } from 'react'
import {
  Search, FileText, GitBranch, Star, TrendingUp,
  Zap, Users, Shield, ArrowRight, Cpu, BookOpen, Layers,
  Database, BarChart2, AlertTriangle, Server, Box, Sparkles,
} from 'lucide-react'
import { fetchNlpMap } from '../api/client.js'

const AGENTS = [
  {
    id: 'market-research',
    label: 'Spectra',
    icon: Search,
    color: '#00F0FF',
    desc: 'Hybrid RAG over Reddit & web corpora. NER ensemble, K-Means theme clustering, DL sentiment, competitor positioning, and Ollama LLM synthesis.',
    techniques: ['Hybrid RAG', 'NER Ensemble', 'K-Means', 'DL Sentiment'],
  },
  {
    id: 'doc-compare',
    label: 'Doc Comparator',
    icon: FileText,
    color: '#8B5CF6',
    desc: 'Paraphrase-aware feature gap analysis using dense cosine matching (≥0.92), TF-IDF VSM, morphological analysis, and LED abstractive summarization.',
    techniques: ['Dense Similarity', 'TF-IDF VSM', 'Morphological Analysis', 'Abstractive Summarization'],
  },
  {
    id: 'knowledge-graph',
    label: 'Knowledge Graph',
    icon: GitBranch,
    color: '#60a5fa',
    desc: 'Entity-relation graph via NER ensemble, full dependency parsing, TF-IDF keyphrases, and betweenness centrality scoring with typed nodes and edges.',
    techniques: ['NER Ensemble', 'Dependency Parsing', 'TF-IDF', 'Graph Centrality'],
  },
  {
    id: 'review-analysis',
    label: 'Review Analysis',
    icon: Star,
    color: '#F59E0B',
    desc: 'DeBERTa-v3 DL sentiment, aspect-level opinion extraction, K-Means review clustering, N-gram phrase mining, and contradiction detection.',
    techniques: ['DeBERTa NLI', 'Aspect Extraction', 'K-Means Clustering', 'Contradiction Detection'],
  },
  {
    id: 'trend-spotting',
    label: 'Trend Spotting',
    icon: TrendingUp,
    color: '#34d399',
    desc: 'LDA topic modeling (Gensim, coherence-scored), N-gram frequency analysis, temporal embedding drift across periods, and anomaly detection.',
    techniques: ['LDA Topic Modeling', 'N-gram Analysis', 'Temporal Drift', 'Anomaly Detection'],
  },
  {
    id: 'brand-association',
    label: 'Brand Association',
    icon: Zap,
    color: '#F472B6',
    desc: 'RAG-powered brand context retrieval, harmonic mean semantic scoring, thematic role extraction (Agent/Theme/Instrument), and competitor benchmarking.',
    techniques: ['RAG Retrieval', 'Semantic Mapping', 'Thematic Roles', 'Competitor Analysis'],
  },
  {
    id: 'persona-generator',
    label: 'Persona Generator',
    icon: Users,
    color: '#8B5CF6',
    desc: 'Dense embedding K-Means clustering, psychographic inference via RAG, style profiling with morphological analysis, and archetype matching across 6 personas.',
    techniques: ['Embedding Clustering', 'Psychographic RAG', 'Style Profiling', 'Archetype Matching'],
  },
  {
    id: 'compliance-check',
    label: 'Compliance Check',
    icon: Shield,
    color: '#F59E0B',
    desc: 'Hybrid BM25+FAISS retrieval over GDPR/HIPAA corpus. DeBERTa-v3 NLI zero-shot entailment scoring with article-level citations and risk severity ranking.',
    techniques: ['BM25 + FAISS', 'NLI Zero-Shot', 'Risk Scoring', 'NER'],
  },
]

const ENTERPRISE = [
  {
    id: 'rag-engine',
    label: 'Knowledge RAG',
    icon: Database,
    color: '#60a5fa',
    desc: 'Ingest documents or PDFs into a persistent FAISS index. Query with natural language and receive cited answers via Ollama RAG with session memory.',
    techniques: ['FAISS IndexFlatIP', 'BM25 Hybrid', 'Sentence-Transformers', 'Ollama LLM'],
  },
  {
    id: 'due-diligence',
    label: 'Due Diligence',
    icon: BarChart2,
    color: '#34d399',
    desc: 'M&A document analysis with PDF/OCR ingestion, financial entity extraction via regex NER, RAG-grounded risk scoring, and LLM verdict generation.',
    techniques: ['PyMuPDF + OCR', 'Financial NER', 'RAG Grounding', 'LLM Verdict'],
  },
  {
    id: 'report-generator',
    label: 'Report Generator',
    icon: FileText,
    color: '#F472B6',
    desc: 'Converts raw insights, metrics, and bullet points into McKinsey-style consulting reports with KPI extraction and structured chart recommendations.',
    techniques: ['LLM Synthesis', 'Input Structuring', 'Chart Generation', 'KPI Extraction'],
  },
  {
    id: 'risk-monitoring',
    label: 'Risk Monitor',
    icon: AlertTriangle,
    color: '#f87171',
    desc: 'Live RSS monitoring across BBC, Reuters, FT. Keyword taxonomy classification across 5 risk categories with NetworkX supply chain impact graphs.',
    techniques: ['RSS Monitoring', 'Keyword Taxonomy', 'NetworkX Graph', 'LLM Risk Analysis'],
  },
]

const TECH_STACK = [
  {
    category: 'Frontend',
    color: '#60a5fa',
    items: ['React 18', 'Vite 5', 'Recharts', 'Framer Motion', 'Force Graph 2D'],
  },
  {
    category: 'Backend',
    color: '#8B5CF6',
    items: ['FastAPI', 'Uvicorn', 'Pydantic v2', 'Python 3.11+'],
  },
  {
    category: 'NLP / Classical',
    color: '#00F0FF',
    items: ['spaCy 3.7', 'FLAIR NER', 'NLTK', 'Gensim LDA', 'scikit-learn', 'BERTopic'],
  },
  {
    category: 'Deep Learning',
    color: '#F472B6',
    items: ['PyTorch', 'HuggingFace Transformers', 'sentence-transformers', 'DeBERTa-v3', 'LED / DistilBART'],
  },
  {
    category: 'LLM & Retrieval',
    color: '#F59E0B',
    items: ['Ollama (llama3)', 'FAISS IndexFlatIP', 'BM25', 'UMAP + HDBSCAN'],
  },
  {
    category: 'Data & Scraping',
    color: '#34d399',
    items: ['Playwright', 'Reddit JSON API', 'Exa.ai', 'BeautifulSoup4', 'NetworkX'],
  },
]

const CATEGORY_COLORS = {
  Preprocessing:  '#94a3b8',
  Syntax:         '#60a5fa',
  Representation: '#8B5CF6',
  Advanced:       '#00F0FF',
  Applications:   '#F59E0B',
}

/* ── Glass Agent Card ────────────────────────────────────────────────────── */
function AgentCard({ agent, index, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = agent.icon

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? `rgba(${hexToRgb(agent.color)}, 0.06)`
          : 'rgba(255, 255, 255, 0.025)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${hovered ? `rgba(${hexToRgb(agent.color)}, 0.25)` : 'rgba(255, 255, 255, 0.07)'}`,
        borderRadius: 16,
        padding: '22px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 320ms cubic-bezier(0.4, 0, 0.2, 1)',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered
          ? `0 8px 40px rgba(0, 0, 0, 0.3), 0 0 30px rgba(${hexToRgb(agent.color)}, 0.08)`
          : '0 4px 24px rgba(0, 0, 0, 0.2)',
        animation: `fadeInUp ${0.3 + index * 0.06}s ease both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: `rgba(${hexToRgb(agent.color)}, 0.1)`,
          border: `1px solid rgba(${hexToRgb(agent.color)}, 0.2)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 15px rgba(${hexToRgb(agent.color)}, 0.1)`,
        }}>
          <Icon size={18} color={agent.color} style={{ filter: `drop-shadow(0 0 4px rgba(${hexToRgb(agent.color)}, 0.4))` }} />
        </div>
        <ArrowRight
          size={15}
          color={agent.color}
          style={{
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateX(0)' : 'translateX(-6px)',
            transition: 'all 280ms cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 4px rgba(${hexToRgb(agent.color)}, 0.5))`,
          }}
        />
      </div>

      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: '0.95rem',
        marginBottom: 6,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
      }}>
        {agent.label}
      </div>

      <div style={{
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.55,
        marginBottom: 14,
      }}>
        {agent.desc}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {agent.techniques.slice(0, 3).map(t => (
          <span key={t} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            padding: '2px 8px',
            background: `rgba(${hexToRgb(agent.color)}, 0.08)`,
            border: `1px solid rgba(${hexToRgb(agent.color)}, 0.18)`,
            borderRadius: 9999,
            color: agent.color,
            letterSpacing: '0.04em',
          }}>
            {t}
          </span>
        ))}
      </div>
    </button>
  )
}

/* ── hex to rgb helper ───────────────────────────────────────────────────── */
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

/* ── Dashboard ───────────────────────────────────────────────────────────── */
export default function ConsultancyDashboard({ onNavigate }) {
  const [nlpMap, setNlpMap] = useState(null)

  useEffect(() => {
    fetchNlpMap().then(setNlpMap).catch(() => {})
  }, [])

  const grouped = nlpMap?.techniques
    ? nlpMap.techniques.reduce((acc, t) => {
        if (!acc[t.category]) acc[t.category] = []
        acc[t.category].push(t)
        return acc
      }, {})
    : null

  return (
    <div style={{ padding: '40px 44px', maxWidth: 1140 }}>

      {/* Hero ─────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 52, animation: 'fadeInUp 0.5s ease both' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 14px',
          background: 'rgba(0, 240, 255, 0.06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(0, 240, 255, 0.15)',
          borderRadius: 9999,
          marginBottom: 20,
        }}>
          <Sparkles size={12} color="#00F0FF" style={{ filter: 'drop-shadow(0 0 4px rgba(0, 240, 255, 0.5))' }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: '#00F0FF',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            NLP Intelligence Platform · v2.0.0
          </span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '3.2rem',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.1,
          marginBottom: 16,
        }}>
          <span className="gradient-text">SPECTRA</span>
          <br />
          <span style={{
            color: 'var(--text-secondary)',
            fontWeight: 400,
            fontSize: '2rem',
          }}>
            Spectra
          </span>
        </h1>

        <p style={{
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          maxWidth: 620,
          lineHeight: 1.7,
        }}>
          Eight specialized NLP agents and four enterprise modules — powered by a local Ollama LLM,
          a multi-model deep learning ensemble (spaCy · FLAIR · DeBERTa · sentence-transformers),
          and hybrid FAISS + BM25 retrieval for grounded, explainable spectra.
        </p>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 12, marginTop: 26, flexWrap: 'wrap' }}>
          {[
            { n: '8',   label: 'AI Agents',          color: '#00F0FF' },
            { n: '4',   label: 'Enterprise Modules',  color: '#8B5CF6' },
            { n: '20+', label: 'NLP Techniques',      color: '#F472B6' },
            { n: '6',   label: 'ML Models',           color: '#F59E0B' },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 9999,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
            }}>
              <span style={{
                fontWeight: 600,
                color: s.color,
                textShadow: `0 0 8px rgba(${hexToRgb(s.color)}, 0.3)`,
              }}>
                {s.n}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Agents Grid ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <Layers size={16} color="var(--text-muted)" />
          <span className="section-label">AI Agents</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            padding: '2px 10px',
            background: 'rgba(0, 240, 255, 0.06)',
            border: '1px solid rgba(0, 240, 255, 0.15)',
            borderRadius: 9999,
            color: '#5eead4',
          }}>
            8 deployed
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
          gap: 14,
        }}>
          {AGENTS.map((agent, i) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              index={i}
              onClick={() => onNavigate(agent.id)}
            />
          ))}
        </div>
      </div>

      {/* Enterprise Modules ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <Server size={16} color="var(--text-muted)" />
          <span className="section-label">Enterprise Modules</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            padding: '2px 10px',
            background: 'rgba(139, 92, 246, 0.06)',
            border: '1px solid rgba(139, 92, 246, 0.15)',
            borderRadius: 9999,
            color: '#c4b5fd',
          }}>
            4 deployed
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
          gap: 14,
        }}>
          {ENTERPRISE.map((mod, i) => {
            const Icon = mod.icon
            return (
              <EnterpriseCard
                key={mod.id}
                mod={mod}
                index={i}
                onClick={() => onNavigate(mod.id)}
              />
            )
          })}
        </div>
      </div>

      {/* Tech Stack ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 56, animation: 'fadeInUp 0.65s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <Box size={16} color="var(--text-muted)" />
          <span className="section-label">Tech Stack</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {TECH_STACK.map(group => (
            <div
              key={group.category}
              className="glass-card"
              style={{ padding: '18px 22px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: group.color,
                  boxShadow: `0 0 10px ${group.color}80`,
                }} />
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: group.color,
                  letterSpacing: '0.02em',
                  textShadow: `0 0 12px rgba(${hexToRgb(group.color)}, 0.2)`,
                }}>
                  {group.category}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.items.map(item => (
                  <span key={item} style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    padding: '3px 9px',
                    background: `rgba(${hexToRgb(group.color)}, 0.06)`,
                    border: `1px solid rgba(${hexToRgb(group.color)}, 0.14)`,
                    borderRadius: 9999,
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.02em',
                  }}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NLP Technique Map ────────────────────────────────────────────────── */}
      <div style={{ animation: 'fadeInUp 0.7s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <BookOpen size={16} color="var(--text-muted)" />
          <span className="section-label">NLP Technique Matrix</span>
          {nlpMap && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              padding: '2px 10px',
              background: 'rgba(52, 211, 153, 0.06)',
              border: '1px solid rgba(52, 211, 153, 0.15)',
              borderRadius: 9999,
              color: '#5eead4',
            }}>
              Live from /api/nlp-map
            </span>
          )}
        </div>

        {grouped ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.entries(grouped).map(([category, techniques]) => (
              <div
                key={category}
                className="glass-card"
                style={{ padding: '20px 24px' }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: CATEGORY_COLORS[category] || '#94a3b8',
                    boxShadow: `0 0 10px ${CATEGORY_COLORS[category] || '#94a3b8'}80`,
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: CATEGORY_COLORS[category] || 'var(--text-secondary)',
                    letterSpacing: '0.02em',
                  }}>
                    {category}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'var(--text-muted)',
                  }}>
                    {techniques.length} technique{techniques.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {techniques.map(t => (
                    <div
                      key={t.technique}
                      title={`Used by: ${Array.isArray(t.agents) ? t.agents.join(', ') : t.agents}`}
                      style={{
                        padding: '7px 14px',
                        background: `rgba(${hexToRgb(CATEGORY_COLORS[category] || '#94a3b8')}, 0.06)`,
                        border: `1px solid rgba(${hexToRgb(CATEGORY_COLORS[category] || '#94a3b8')}, 0.14)`,
                        borderRadius: 12,
                        cursor: 'default',
                        transition: 'all 200ms ease',
                      }}
                    >
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.76rem',
                        color: CATEGORY_COLORS[category] || 'var(--text-secondary)',
                        fontWeight: 500,
                        marginBottom: 2,
                      }}>
                        {t.technique}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                        letterSpacing: '0.03em',
                      }}>
                        {Array.isArray(t.agents) ? t.agents.slice(0, 2).join(' · ') : t.agents}
                        {Array.isArray(t.agents) && t.agents.length > 2 ? ` +${t.agents.length - 2}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Skeleton loader */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[5, 4, 4, 3, 3].map((n, i) => (
              <div key={i} className="glass-card" style={{ padding: '20px 24px' }}>
                <div style={{
                  height: 14, width: 120, borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.04)',
                  marginBottom: 14,
                }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Array.from({ length: n }).map((_, j) => (
                    <div key={j} style={{
                      height: 38, width: 110 + j * 15, borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.02)',
                      animation: 'shimmer 1.8s infinite',
                      backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)',
                      backgroundSize: '200% 100%',
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Enterprise Card ─────────────────────────────────────────────────────── */
function EnterpriseCard({ mod, index, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = mod.icon

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? `rgba(${hexToRgb(mod.color)}, 0.06)`
          : 'rgba(255, 255, 255, 0.025)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${hovered ? `rgba(${hexToRgb(mod.color)}, 0.25)` : 'rgba(255, 255, 255, 0.07)'}`,
        borderRadius: 16,
        padding: '22px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 320ms cubic-bezier(0.4, 0, 0.2, 1)',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered
          ? `0 8px 40px rgba(0, 0, 0, 0.3), 0 0 30px rgba(${hexToRgb(mod.color)}, 0.08)`
          : '0 4px 24px rgba(0, 0, 0, 0.2)',
        animation: `fadeInUp ${0.5 + index * 0.06}s ease both`,
        position: 'relative',
      }}
    >
      {/* Enterprise badge */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.58rem',
        padding: '2px 8px',
        background: `rgba(${hexToRgb(mod.color)}, 0.08)`,
        border: `1px solid rgba(${hexToRgb(mod.color)}, 0.2)`,
        borderRadius: 9999,
        color: mod.color,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        Enterprise
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: `rgba(${hexToRgb(mod.color)}, 0.1)`,
          border: `1px solid rgba(${hexToRgb(mod.color)}, 0.2)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 15px rgba(${hexToRgb(mod.color)}, 0.1)`,
        }}>
          <Icon size={18} color={mod.color} style={{ filter: `drop-shadow(0 0 4px rgba(${hexToRgb(mod.color)}, 0.4))` }} />
        </div>
      </div>

      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: '0.95rem',
        marginBottom: 6,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
      }}>
        {mod.label}
      </div>

      <div style={{
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.55,
        marginBottom: 14,
      }}>
        {mod.desc}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {mod.techniques.slice(0, 3).map(t => (
          <span key={t} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            padding: '2px 8px',
            background: `rgba(${hexToRgb(mod.color)}, 0.08)`,
            border: `1px solid rgba(${hexToRgb(mod.color)}, 0.18)`,
            borderRadius: 9999,
            color: mod.color,
            letterSpacing: '0.04em',
          }}>
            {t}
          </span>
        ))}
      </div>
    </button>
  )
}
