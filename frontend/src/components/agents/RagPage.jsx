import { useState, useCallback, useRef, useEffect } from 'react'
import { runRagQuery, ragIngestText, ragIngestFile, getRagStats } from '../../api/client.js'

/* ─────────────────────────────────────────────────────────────────────────────
   Design tokens — deep navy + electric teal knowledge aesthetic
───────────────────────────────────────────────────────────────────────────── */
const T = {
  bg:        '#07090e',
  surface:   '#0c0f1a',
  panel:     '#101626',
  card:      '#131b2e',
  border:    '#1a2540',
  borderHi:  '#283860',

  teal:      '#1fe4c8',
  tealDim:   'rgba(31,228,200,0.1)',
  tealGlow:  'rgba(31,228,200,0.05)',
  blue:      '#4f8ef7',
  blueDim:   'rgba(79,142,247,0.1)',

  t1:  '#dde3f0',
  t2:  '#7a84a0',
  t3:  '#3e4560',
  t4:  '#1c2235',

  fontMono:    "'JetBrains Mono', 'Fira Code', monospace",
  fontDisplay: "'Syne', 'DM Sans', sans-serif",
}

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
    `}</style>
  )
}

/* ── Copy hook ── */
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

/* ── Label chip ── */
function Chip({ label, color }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px', borderRadius: 4,
      background: `${color}18`,
      border: `1px solid ${color}40`,
      color, fontFamily: T.fontMono, fontSize: '0.62rem',
      letterSpacing: '0.06em',
    }}>{label}</span>
  )
}

/* ── Section header ── */
function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: T.fontMono, fontSize: '0.62rem', fontWeight: 600,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      color: T.t2, marginBottom: 10,
    }}>{children}</div>
  )
}

/* ── Message bubble ── */
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16,
    }}>
      <div style={{
        maxWidth: '80%',
        background: isUser ? T.tealDim : T.card,
        border: `1px solid ${isUser ? 'rgba(31,228,200,0.2)' : T.border}`,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '12px 16px',
      }}>
        {/* Role badge */}
        <div style={{
          fontFamily: T.fontMono, fontSize: '0.6rem', fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: isUser ? T.teal : T.blue,
          marginBottom: 6,
        }}>
          {isUser ? 'You' : 'SPECTRA RAG'}
        </div>

        {/* Content */}
        <div style={{
          fontFamily: T.fontDisplay, fontSize: '0.9rem',
          color: T.t1, lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
        }}>
          {msg.content}
        </div>

        {/* Sources (assistant only) */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            <div style={{
              fontFamily: T.fontMono, fontSize: '0.6rem',
              color: T.t2, marginBottom: 6, letterSpacing: '0.08em',
            }}>
              SOURCES ({msg.sources.length})
            </div>
            {msg.sources.map((s, i) => (
              <div key={i} style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 6, padding: '6px 10px', marginBottom: 5,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <Chip label={s.source} color={T.blue} />
                  <span style={{ fontFamily: T.fontMono, fontSize: '0.6rem', color: T.t3 }}>
                    score: {s.score?.toFixed(3)}
                  </span>
                </div>
                <div style={{
                  fontFamily: T.fontMono, fontSize: '0.72rem',
                  color: T.t2, lineHeight: 1.5,
                }}>
                  {s.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Copy button for assistant messages */}
        {!isUser && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <CopyBtn text={msg.content} label="Copy Answer" />
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Ingest panel ── */
function IngestPanel({ onIngested }) {
  const [mode, setMode] = useState('text') // 'text' | 'file'
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const handleIngest = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      let res
      if (mode === 'text') {
        res = await ragIngestText({ content: text, source_name: sourceName || 'manual' })
      } else {
        if (!file) { setError('Please select a file.'); setLoading(false); return }
        const fd = new FormData()
        fd.append('file', file)
        fd.append('source_name', sourceName || file.name)
        res = await ragIngestFile(fd)
      }
      setResult(res)
      if (onIngested) onIngested()
      setText(''); setSourceName(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 20,
    }}>
      <SectionLabel>Ingest Knowledge</SectionLabel>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['text', 'file'].map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
            fontFamily: T.fontMono, fontSize: '0.72rem',
            background: mode === m ? T.tealDim : 'transparent',
            border: `1px solid ${mode === m ? 'rgba(31,228,200,0.3)' : T.border}`,
            color: mode === m ? T.teal : T.t2,
            transition: 'all 0.2s',
          }}>{m === 'text' ? 'Paste Text' : 'Upload File'}</button>
        ))}
      </div>

      {/* Source name */}
      <input
        placeholder="Source name (e.g. Q3-Report)"
        value={sourceName}
        onChange={e => setSourceName(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 7, padding: '8px 12px', marginBottom: 10,
          fontFamily: T.fontMono, fontSize: '0.8rem', color: T.t1,
          outline: 'none',
        }}
      />

      {mode === 'text' ? (
        <textarea
          placeholder="Paste document text here…"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={6}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 7, padding: '10px 12px', marginBottom: 10,
            fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t1,
            outline: 'none', lineHeight: 1.6,
          }}
        />
      ) : (
        <div style={{
          border: `1px dashed ${T.borderHi}`, borderRadius: 7,
          padding: '18px', marginBottom: 10, textAlign: 'center',
          background: T.surface, cursor: 'pointer',
        }}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef} type="file"
            accept=".txt,.pdf,.md,.csv"
            style={{ display: 'none' }}
            onChange={e => setFile(e.target.files[0])}
          />
          <div style={{ fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t2 }}>
            {file ? `📄 ${file.name}` : 'Click to select .txt / .pdf / .md'}
          </div>
        </div>
      )}

      <button
        onClick={handleIngest}
        disabled={loading || (mode === 'text' && !text.trim())}
        style={{
          width: '100%', padding: '9px', borderRadius: 7,
          background: loading ? T.t4 : T.tealDim,
          border: `1px solid ${loading ? T.border : 'rgba(31,228,200,0.3)'}`,
          color: loading ? T.t2 : T.teal,
          fontFamily: T.fontMono, fontSize: '0.8rem', fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {loading ? 'Ingesting…' : 'Add to Knowledge Base'}
      </button>

      {result && (
        <div style={{
          marginTop: 10, padding: '8px 12px',
          background: 'rgba(31,228,200,0.06)', borderRadius: 7,
          border: '1px solid rgba(31,228,200,0.2)',
          fontFamily: T.fontMono, fontSize: '0.75rem', color: T.teal,
        }}>
          ✓ {result.message}
        </div>
      )}
      {error && (
        <div style={{
          marginTop: 10, padding: '8px 12px',
          background: 'rgba(224,94,114,0.06)', borderRadius: 7,
          border: '1px solid rgba(224,94,114,0.2)',
          fontFamily: T.fontMono, fontSize: '0.75rem', color: '#e05e72',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}

/* ── Stats card ── */
function StatsCard({ stats }) {
  if (!stats) return null
  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 16, marginTop: 12,
    }}>
      <SectionLabel>Index Status</SectionLabel>
      <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: T.fontMono, fontSize: '1.4rem', fontWeight: 700, color: T.teal }}>
            {stats.total_chunks}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t2 }}>chunks</div>
        </div>
        <div>
          <div style={{ fontFamily: T.fontMono, fontSize: '1.4rem', fontWeight: 700, color: T.blue }}>
            {stats.total_sources}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t2 }}>sources</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {(stats.sources || []).map(s => <Chip key={s} label={s} color={T.blue} />)}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Main RagPage component
═══════════════════════════════════════════════════════════════════════════════ */
export default function RagPage() {
  const [messages, setMessages] = useState([])
  const [query, setQuery] = useState('')
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState(null)
  const bottomRef = useRef(null)

  const fetchStats = useCallback(async () => {
    try {
      const s = await getRagStats()
      setStats(s)
    } catch (_) {}
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = useCallback(async () => {
    const q = query.trim()
    if (!q || loading) return
    setError('')
    setQuery('')

    const userMsg = { role: 'user', content: q }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await runRagQuery({ query: q, session_id: sessionId })
      const assistantMsg = {
        role: 'assistant',
        content: res.answer,
        sources: res.sources || [],
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      setError(e.message)
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }, [query, loading, sessionId])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const fullTranscript = messages
    .map(m => `[${m.role.toUpperCase()}]\n${m.content}`)
    .join('\n\n---\n\n')

  return (
    <div style={{
      background: T.bg,
      minHeight: '100vh',
      padding: '32px 28px',
      fontFamily: T.fontDisplay,
      color: T.t1,
    }}>
      <FontLoader />

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, #1fe4c8 0%, #4f8ef7 100%)',
            borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
          }}>🧠</div>
          <h1 style={{
            fontFamily: T.fontDisplay, fontWeight: 800, fontSize: '1.5rem',
            letterSpacing: '-0.03em', color: T.t1, margin: 0,
          }}>
            Enterprise Knowledge RAG
          </h1>
        </div>
        <p style={{ fontFamily: T.fontMono, fontSize: '0.75rem', color: T.t2, margin: 0 }}>
          Ingest documents · Semantic retrieval · Session-aware chat
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, maxWidth: 1200 }}>

        {/* ── Left: Ingest + Stats ── */}
        <div>
          <IngestPanel onIngested={fetchStats} />
          <StatsCard stats={stats} />
        </div>

        {/* ── Right: Chat panel ── */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 14, overflow: 'hidden',
          minHeight: 520,
        }}>
          {/* Chat header */}
          <div style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Chip label="RAG ENGINE" color={T.teal} />
              <span style={{ fontFamily: T.fontMono, fontSize: '0.68rem', color: T.t3 }}>
                session: {sessionId.slice(-8)}
              </span>
            </div>
            {messages.length > 0 && (
              <CopyBtn text={fullTranscript} label="Export Chat" />
            )}
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '20px 20px 8px',
          }}>
            {messages.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: '100%', gap: 10, opacity: 0.5,
              }}>
                <div style={{ fontSize: '2.5rem' }}>💬</div>
                <div style={{ fontFamily: T.fontMono, fontSize: '0.8rem', color: T.t2, textAlign: 'center' }}>
                  Ask a question about your knowledge base.<br />
                  Ingest documents on the left to get started.
                </div>
              </div>
            )}

            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
                <div style={{
                  background: T.card, border: `1px solid ${T.border}`,
                  borderRadius: '14px 14px 14px 4px', padding: '12px 18px',
                }}>
                  <div style={{
                    display: 'flex', gap: 5, alignItems: 'center',
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: T.teal, opacity: 0.6,
                        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          {error && (
            <div style={{
              margin: '0 20px 8px',
              padding: '7px 12px', borderRadius: 7,
              background: 'rgba(224,94,114,0.06)',
              border: '1px solid rgba(224,94,114,0.2)',
              fontFamily: T.fontMono, fontSize: '0.73rem', color: '#e05e72',
            }}>
              {error}
            </div>
          )}
          <div style={{
            padding: '14px 16px',
            borderTop: `1px solid ${T.border}`,
            display: 'flex', gap: 10, alignItems: 'flex-end',
          }}>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your documents… (Enter to send)"
              rows={2}
              style={{
                flex: 1, resize: 'none', boxSizing: 'border-box',
                background: T.panel, border: `1px solid ${T.borderHi}`,
                borderRadius: 9, padding: '10px 14px',
                fontFamily: T.fontDisplay, fontSize: '0.9rem', color: T.t1,
                outline: 'none', lineHeight: 1.5,
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !query.trim()}
              style={{
                padding: '10px 20px', borderRadius: 9,
                background: (loading || !query.trim()) ? T.t4 : T.tealDim,
                border: `1px solid ${(loading || !query.trim()) ? T.border : 'rgba(31,228,200,0.35)'}`,
                color: (loading || !query.trim()) ? T.t3 : T.teal,
                fontFamily: T.fontMono, fontSize: '0.8rem', fontWeight: 600,
                cursor: (loading || !query.trim()) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}
            >
              {loading ? '…' : 'Send →'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(0.7); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
