import { useState, useCallback, useRef, useEffect } from 'react'
import { runReportGeneration } from '../../api/client.js'
import ReactMarkdown from 'react-markdown'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

/* ─────────────────────────────────────────────────────────────────────────────
   Design tokens
───────────────────────────────────────────────────────────────────────────── */
const T = {
  bg:        '#070c0e',
  surface:   '#0b1015',
  panel:     '#0f1720',
  card:      '#121e2a',
  border:    '#1a2838',
  borderHi:  '#243850',

  emerald:   '#22d3a5',
  emerDim:   'rgba(34,211,165,0.09)',
  emerBright:'rgba(34,211,165,0.18)',
  blue:      '#4f8ef7',
  blueDim:   'rgba(79,142,247,0.09)',
  gold:      '#c8972a',
  goldDim:   'rgba(200,151,42,0.09)',
  red:       '#e05e72',
  redDim:    'rgba(224,94,114,0.08)',

  t1:  '#dde3f0',
  t2:  '#7a84a0',
  t3:  '#3e4560',
  t4:  '#1f2a3a',

  fontMono:    "'JetBrains Mono', 'Fira Code', monospace",
  fontDisplay: "'Syne', 'DM Sans', sans-serif",
}

const CHART_COLORS = ['#22d3a5','#4f8ef7','#c8972a','#e05e72','#a78bfa','#34d399','#f59e0b']

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: ${T.surface}; }
      ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: ${T.borderHi}; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      @keyframes slideIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
      @keyframes expandIn {
        from { opacity: 0; transform: scaleY(0.92); }
        to   { opacity: 1; transform: scaleY(1); }
      }
    `}</style>
  )
}

/* ── Utility hooks ── */
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

/* ── Shared components ── */
function CopyBtn({ text, label = 'Copy', color }) {
  const [copied, copy] = useCopy(text)
  const c = color || T.emerald
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 6,
      background: copied ? `${c}18` : 'rgba(255,255,255,0.04)',
      border: `1px solid ${copied ? `${c}40` : T.border}`,
      color: copied ? c : T.t2,
      fontFamily: T.fontMono, fontSize: '0.68rem', cursor: 'pointer',
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

function Input({ placeholder, value, onChange, onKeyDown, style = {} }) {
  return (
    <input
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      style={{
        width: '100%',
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 7, padding: '9px 12px',
        fontFamily: T.fontMono, fontSize: '0.8rem', color: T.t1,
        outline: 'none', transition: 'border-color 0.15s', ...style,
      }}
      onFocus={e => e.target.style.borderColor = T.borderHi}
      onBlur={e => e.target.style.borderColor = T.border}
    />
  )
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{
      display: 'flex', background: T.surface,
      border: `1px solid ${T.border}`, borderRadius: 8, padding: 3, gap: 3,
    }}>
      {options.map(opt => (
        <button key={String(opt.value)} onClick={() => onChange(opt.value)} style={{
          flex: 1, padding: '6px 14px', borderRadius: 6, border: 'none',
          background: value === opt.value ? T.emerDim : 'transparent',
          color: value === opt.value ? T.emerald : T.t2,
          fontFamily: T.fontMono, fontSize: '0.72rem', fontWeight: value === opt.value ? 600 : 400,
          cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap',
        }}>{opt.label}</button>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Bulk parsing utilities
───────────────────────────────────────────────────────────────────────────── */

function parseBulkBullets(raw) {
  if (!raw.trim()) return []
  const pipeRe   = /^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/
  const bulletRe = /^[-*•]\s+(.+)$/
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const pipe = pipeRe.exec(line)
      if (pipe) return `${pipe[1].trim()} — ${pipe[2].trim()} [${pipe[3].trim().toUpperCase()}]`
      const bul = bulletRe.exec(line)
      if (bul) return bul[1].trim()
      return line
    })
}

function parseBulkMetrics(raw) {
  if (!raw.trim()) return {}
  const result = {}
  const csvHeaderRe = /^(metric|name),\s*value$/i
  let csvMode = false

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (csvHeaderRe.test(line)) { csvMode = true; continue }

    if (csvMode) {
      const parts = line.split(',').map(s => s.trim())
      if (parts.length >= 2 && parts[0]) {
        result[parts[0]] = parts.slice(1).join(',').trim()
        continue
      }
    }

    const delimiters = [
      /^(.+?)\s*:\s*(.+)$/,
      /^(.+?)\s*=\s*(.+)$/,
      /^(.+?)\s*\|\s*(.+)$/,
      /^(.+?)\s*→\s*(.+)$/,
      /^(.+?)\s+-\s+(.+)$/,
    ]
    let matched = false
    for (const re of delimiters) {
      const m = re.exec(line)
      if (m && m[1].trim().split(/\s+/).length <= 6) {
        result[m[1].trim()] = m[2].trim()
        matched = true
        break
      }
    }
    if (!matched) {
      const spaceIdx = line.indexOf(' ')
      if (spaceIdx > 0) {
        const k = line.slice(0, spaceIdx).trim()
        const v = line.slice(spaceIdx + 1).trim()
        if (k && v) result[k] = v
      }
    }
  }
  return result
}

/* ── Toast notification ── */
function Toast({ message, color, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '9px 18px', borderRadius: 8,
      background: T.card, border: `1px solid ${color}40`,
      fontFamily: T.fontMono, fontSize: '0.74rem', color,
      boxShadow: `0 4px 24px rgba(0,0,0,0.4)`,
      animation: 'slideIn 0.2s ease',
    }}>{message}</div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Inline Bulk Panel — shared base component
   Renders inline below the header, expanding into view with a fade animation.
───────────────────────────────────────────────────────────────────────────── */
function InlineBulkPanel({ children, accentColor }) {
  return (
    <div style={{
      marginTop: 10,
      borderRadius: 10,
      border: `1px solid ${accentColor}35`,
      background: T.surface,
      overflow: 'hidden',
      transformOrigin: 'top center',
      animation: 'expandIn 0.18s ease',
    }}>
      {/* Accent bar at top */}
      <div style={{
        height: 2,
        background: `linear-gradient(90deg, ${accentColor}60, transparent)`,
      }} />
      <div style={{ padding: '14px 14px 12px' }}>
        {children}
      </div>
    </div>
  )
}

/* ── BulletEditor: inline toggle between single-add and bulk-paste modes ── */
function BulletEditor({ bullets, setBullets }) {
  const [draft, setDraft]       = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [toast, setToast]       = useState(null)

  const addSingle = () => {
    if (draft.trim()) { setBullets(prev => [...prev, draft.trim()]); setDraft('') }
  }

  const importBulk = () => {
    const parsed = parseBulkBullets(bulkText)
    if (parsed.length) {
      setBullets(prev => [...prev, ...parsed])
      setToast(`${parsed.length} point${parsed.length !== 1 ? 's' : ''} imported`)
      setBulkText('')
      setBulkMode(false)
    }
  }

  const cancelBulk = () => {
    setBulkText('')
    setBulkMode(false)
  }

  const preview = bulkText.trim() ? parseBulkBullets(bulkText) : []

  return (
    <div>
      {toast && <Toast message={`✓ ${toast}`} color={T.blue} onDone={() => setToast(null)} />}

      {/* Mode header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3 }}>
          {bulkMode ? 'Paste multiple points, one per line' : 'One point at a time, or switch to bulk'}
        </span>
        <button
          onClick={() => setBulkMode(v => !v)}
          style={{
            padding: '4px 11px', borderRadius: 6, cursor: 'pointer', border: 'none',
            background: bulkMode ? T.blueDim : 'rgba(255,255,255,0.05)',
            color: bulkMode ? T.blue : T.t2,
            fontFamily: T.fontMono, fontSize: '0.68rem', fontWeight: 600,
            transition: 'all 0.15s',
          }}
        >
          {bulkMode ? '← Single' : '⎘ Bulk'}
        </button>
      </div>

      {/* ── SINGLE MODE ── */}
      {!bulkMode && (
        <div style={{ animation: 'fadeUp 0.15s ease' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <Input
              placeholder="Add a key point… or use pipe: Insight | Impact | Priority"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSingle()}
              style={{ flex: 1 }}
            />
            <AddBtn onClick={addSingle} />
          </div>
        </div>
      )}

      {/* ── BULK MODE ── */}
      {bulkMode && (
        <InlineBulkPanel accentColor={T.blue}>
          <div style={{
            fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3,
            marginBottom: 8, lineHeight: 1.6,
          }}>
            Each line → one point &nbsp;·&nbsp;
            <span style={{ color: T.blue }}>- prefix</span> supported &nbsp;·&nbsp;
            <span style={{ color: T.gold }}>Insight | Impact | Priority</span> pipe format
          </div>

          <textarea
            autoFocus
            placeholder={`Strong network effects\n- High retention rate\nMarket dominance | 45% share | HIGH\nExpanding globally`}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={5}
            style={{
              width: '100%', resize: 'vertical',
              background: T.panel, border: `1px solid ${T.border}`,
              borderRadius: 7, padding: '8px 12px',
              fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t1,
              outline: 'none', lineHeight: 1.6, marginBottom: 10,
            }}
          />

          {/* Inline preview strip */}
          {preview.length > 0 && (
            <div style={{
              marginBottom: 10, padding: '8px 10px', borderRadius: 7,
              background: T.panel, border: `1px solid ${T.border}`,
            }}>
              <div style={{
                fontFamily: T.fontMono, fontSize: '0.6rem', color: T.blue,
                marginBottom: 5, letterSpacing: '0.1em',
              }}>
                PREVIEW — {preview.length} point{preview.length !== 1 ? 's' : ''} detected
              </div>
              {preview.slice(0, 4).map((b, i) => (
                <div key={i} style={{
                  fontFamily: T.fontMono, fontSize: '0.72rem', color: T.t1,
                  padding: '3px 0',
                  borderBottom: i < Math.min(preview.length, 4) - 1 ? `1px solid ${T.border}` : 'none',
                }}>
                  <span style={{ color: T.blue, marginRight: 6 }}>•</span>{b}
                </div>
              ))}
              {preview.length > 4 && (
                <div style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3, marginTop: 4 }}>
                  +{preview.length - 4} more…
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cancelBulk} style={{
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              background: 'none', border: `1px solid ${T.border}`,
              color: T.t2, fontFamily: T.fontMono, fontSize: '0.72rem',
            }}>Cancel</button>
            <button
              onClick={importBulk}
              disabled={preview.length === 0}
              style={{
                padding: '6px 16px', borderRadius: 6,
                cursor: preview.length ? 'pointer' : 'not-allowed',
                background: preview.length ? T.blueDim : T.t4,
                border: `1px solid ${preview.length ? T.blue + '50' : T.border}`,
                color: preview.length ? T.blue : T.t3,
                fontFamily: T.fontMono, fontSize: '0.72rem', fontWeight: 600,
                transition: 'all 0.15s',
              }}
            >
              Import {preview.length > 0 ? preview.length : ''} Point{preview.length !== 1 ? 's' : ''}
            </button>
          </div>
        </InlineBulkPanel>
      )}

      {/* Bullet list */}
      {bullets.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '7px 10px', marginBottom: 5, borderRadius: 6,
              background: T.panel, border: `1px solid ${T.border}`,
              animation: 'fadeUp 0.2s ease',
            }}>
              <span style={{ color: T.emerald, fontFamily: T.fontMono, marginTop: 1 }}>•</span>
              <span style={{ flex: 1, fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t1 }}>{b}</span>
              <button onClick={() => setBullets(prev => prev.filter((_, j) => j !== i))} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: T.t3, fontSize: '0.85rem',
              }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── MetricsEditor: inline toggle between single-add and bulk-paste modes ── */
function MetricsEditor({ metrics, setMetrics }) {
  const [key, setKey]           = useState('')
  const [val, setVal]           = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [toast, setToast]       = useState(null)

  const addSingle = () => {
    if (key.trim() && val.trim()) {
      setMetrics(prev => ({ ...prev, [key.trim()]: val.trim() }))
      setKey(''); setVal('')
    }
  }

  const importBulk = () => {
    const parsed = parseBulkMetrics(bulkText)
    const count = Object.keys(parsed).length
    if (count) {
      setMetrics(prev => ({ ...prev, ...parsed }))
      setToast(`${count} metric${count !== 1 ? 's' : ''} imported`)
      setBulkText('')
      setBulkMode(false)
    }
  }

  const cancelBulk = () => {
    setBulkText('')
    setBulkMode(false)
  }

  const parsedPreview = bulkText.trim() ? parseBulkMetrics(bulkText) : {}
  const previewEntries = Object.entries(parsedPreview)

  return (
    <div>
      {toast && <Toast message={`✓ ${toast}`} color={T.gold} onDone={() => setToast(null)} />}

      {/* Mode header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3 }}>
          {bulkMode ? 'Paste key-value pairs in any format' : 'Add metrics one at a time, or switch to bulk'}
        </span>
        <button
          onClick={() => setBulkMode(v => !v)}
          style={{
            padding: '4px 11px', borderRadius: 6, cursor: 'pointer', border: 'none',
            background: bulkMode ? T.goldDim : 'rgba(255,255,255,0.05)',
            color: bulkMode ? T.gold : T.t2,
            fontFamily: T.fontMono, fontSize: '0.68rem', fontWeight: 600,
            transition: 'all 0.15s',
          }}
        >
          {bulkMode ? '← Single' : '⎘ Bulk'}
        </button>
      </div>

      {/* ── SINGLE MODE ── */}
      {!bulkMode && (
        <div style={{ animation: 'fadeUp 0.15s ease' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <Input
              placeholder="Metric name"
              value={key}
              onChange={e => setKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSingle()}
              style={{ flex: 1 }}
            />
            <Input
              placeholder="Value"
              value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSingle()}
              style={{ flex: 1 }}
            />
            <AddBtn onClick={addSingle} />
          </div>
        </div>
      )}

      {/* ── BULK MODE ── */}
      {bulkMode && (
        <InlineBulkPanel accentColor={T.gold}>
          <div style={{
            fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3,
            marginBottom: 8, lineHeight: 1.6,
          }}>
            Flexible formats accepted: &nbsp;
            <span style={{ color: T.gold }}>Revenue: $10M</span> &nbsp;·&nbsp;
            <span style={{ color: T.blue }}>Users = 1M</span> &nbsp;·&nbsp;
            <span style={{ color: T.emerald }}>Churn → 3.2%</span>
          </div>

          <textarea
            autoFocus
            placeholder={`Revenue: $10M\nMonthly Users = 1.2M\nChurn Rate → 3.2%\nNPS | 68`}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={5}
            style={{
              width: '100%', resize: 'vertical',
              background: T.panel, border: `1px solid ${T.border}`,
              borderRadius: 7, padding: '8px 12px',
              fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t1,
              outline: 'none', lineHeight: 1.6, marginBottom: 10,
            }}
          />

          {/* Inline preview strip */}
          {previewEntries.length > 0 && (
            <div style={{
              marginBottom: 10, padding: '8px 10px', borderRadius: 7,
              background: T.panel, border: `1px solid ${T.border}`,
            }}>
              <div style={{
                fontFamily: T.fontMono, fontSize: '0.6rem', color: T.gold,
                marginBottom: 5, letterSpacing: '0.1em',
              }}>
                PREVIEW — {previewEntries.length} metric{previewEntries.length !== 1 ? 's' : ''} detected
              </div>
              {previewEntries.slice(0, 4).map(([k, v], i) => (
                <div key={i} style={{
                  fontFamily: T.fontMono, fontSize: '0.72rem', color: T.t1,
                  padding: '3px 0',
                  borderBottom: i < Math.min(previewEntries.length, 4) - 1 ? `1px solid ${T.border}` : 'none',
                }}>
                  <span style={{ color: T.gold }}>{k}:</span>
                  <span style={{ color: T.t2, marginLeft: 6 }}>{v}</span>
                </div>
              ))}
              {previewEntries.length > 4 && (
                <div style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3, marginTop: 4 }}>
                  +{previewEntries.length - 4} more…
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cancelBulk} style={{
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              background: 'none', border: `1px solid ${T.border}`,
              color: T.t2, fontFamily: T.fontMono, fontSize: '0.72rem',
            }}>Cancel</button>
            <button
              onClick={importBulk}
              disabled={previewEntries.length === 0}
              style={{
                padding: '6px 16px', borderRadius: 6,
                cursor: previewEntries.length ? 'pointer' : 'not-allowed',
                background: previewEntries.length ? T.goldDim : T.t4,
                border: `1px solid ${previewEntries.length ? T.gold + '50' : T.border}`,
                color: previewEntries.length ? T.gold : T.t3,
                fontFamily: T.fontMono, fontSize: '0.72rem', fontWeight: 600,
                transition: 'all 0.15s',
              }}
            >
              Import {previewEntries.length > 0 ? previewEntries.length : ''} Metric{previewEntries.length !== 1 ? 's' : ''}
            </button>
          </div>
        </InlineBulkPanel>
      )}

      {/* Chips */}
      {Object.keys(metrics).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {Object.entries(metrics).map(([k, v]) => (
            <Chip key={k} onRemove={() => {
              const m = { ...metrics }; delete m[k]; setMetrics(m)
            }}>
              <span style={{ color: T.emerald }}>{k}:</span> {v}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Sections editor ── */
function SectionsEditor({ sections, setSections }) {
  const [heading, setHeading] = useState('')
  const [content, setContent] = useState('')
  const add = () => {
    if (heading.trim() && content.trim()) {
      setSections(prev => [...prev, { heading: heading.trim(), content: content.trim() }])
      setHeading(''); setContent('')
    }
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        <Input placeholder="Section heading" value={heading} onChange={e => setHeading(e.target.value)} />
        <textarea placeholder="Section content…" value={content} onChange={e => setContent(e.target.value)}
          rows={2} style={{
            width: '100%', resize: 'vertical',
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 7, padding: '8px 12px',
            fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t1,
            outline: 'none', lineHeight: 1.5,
          }} />
        <AddBtn onClick={add} label="Add Section" wide />
      </div>
      {sections.map((s, i) => (
        <div key={i} style={{
          padding: '8px 12px', marginBottom: 6, borderRadius: 7,
          background: T.panel, border: `1px solid ${T.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: '0.75rem', fontWeight: 600, color: T.blue }}>
              {s.heading}
            </span>
            <button onClick={() => setSections(prev => prev.filter((_, j) => j !== i))} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: T.t3,
            }}>×</button>
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: '0.72rem', color: T.t2, lineHeight: 1.4 }}>
            {s.content.slice(0, 80)}{s.content.length > 80 ? '…' : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Reusable small components ── */
function AddBtn({ onClick, label = '+', wide = false }) {
  return (
    <button onClick={onClick} style={{
      padding: wide ? '8px 18px' : '9px 14px', borderRadius: 7,
      background: T.emerDim, border: `1px solid rgba(34,211,165,0.25)`,
      color: T.emerald, fontFamily: T.fontMono, fontSize: '0.78rem',
      cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
    }}>{label}</button>
  )
}

function Chip({ children, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 5,
      background: T.panel, border: `1px solid ${T.border}`,
      fontFamily: T.fontMono, fontSize: '0.72rem', color: T.t1,
    }}>
      {children}
      {onRemove && (
        <button onClick={onRemove} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.t3, marginLeft: 3, fontSize: '0.8rem', lineHeight: 1,
        }}>×</button>
      )}
    </div>
  )
}

/* ── Metrics Dashboard ── */
function MetricsDashboard({ metrics }) {
  if (!metrics || Object.keys(metrics).length === 0) return null
  const entries = Object.entries(metrics)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(140px, 1fr))`,
      gap: 10, marginBottom: 20,
    }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{
          background: T.panel, border: `1px solid ${T.border}`,
          borderRadius: 10, padding: '14px 16px',
          borderTop: `2px solid ${T.emerald}`,
        }}>
          <div style={{
            fontFamily: T.fontDisplay, fontWeight: 700,
            fontSize: '1.1rem', color: T.emerald, lineHeight: 1.1, marginBottom: 4,
          }}>{v}</div>
          <div style={{
            fontFamily: T.fontMono, fontSize: '0.65rem', color: T.t2,
            textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.3,
          }}>{k}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Chart renderer ── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: '8px 12px',
      fontFamily: T.fontMono, fontSize: '0.72rem', color: T.t1,
    }}>
      <div style={{ color: T.t2, marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || T.emerald }}>
          {typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.value}
        </div>
      ))}
    </div>
  )
}

function ChartBlock({ chart }) {
  const { type, title, data } = chart
  const h = 220
  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 11, padding: '18px 16px', marginBottom: 14,
    }}>
      <div style={{
        fontFamily: T.fontMono, fontSize: '0.7rem', fontWeight: 600,
        color: T.t2, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14,
      }}>{title}</div>

      {type === 'bar' && (
        <ResponsiveContainer width="100%" height={h}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 30, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fontFamily: T.fontMono, fontSize: 10, fill: T.t3 }}
              angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontFamily: T.fontMono, fontSize: 10, fill: T.t3 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      {type === 'line' && (
        <ResponsiveContainer width="100%" height={h}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fontFamily: T.fontMono, fontSize: 10, fill: T.t3 }} />
            <YAxis tick={{ fontFamily: T.fontMono, fontSize: 10, fill: T.t3 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="value" stroke={T.emerald} strokeWidth={2}
              dot={{ fill: T.emerald, r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
      {type === 'pie' && (
        <ResponsiveContainer width="100%" height={h}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label"
              cx="50%" cy="50%" outerRadius={80}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ stroke: T.t3 }}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

/* ── Report view ── */
function ReportView({ result, consultingMode }) {
  const [editMode, setEditMode] = useState(false)
  const [editedText, setEditedText] = useState(result.report_text)
  const displayText = editMode ? editedText : result.report_text

  const downloadMd = () => {
    const blob = new Blob([displayText], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'report.md'
    a.click()
  }

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'report.json'
    a.click()
  }

  const metrics = result.metrics || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, animation: 'fadeUp 0.3s ease' }}>
      {/* Sticky action bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: '14px 14px 0 0',
        padding: '10px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: T.emerald, boxShadow: `0 0 6px ${T.emerald}`,
            animation: 'pulse 2s infinite',
          }} />
          <span style={{ fontFamily: T.fontMono, fontSize: '0.65rem', color: T.t2, letterSpacing: '0.08em' }}>
            GENERATED REPORT
          </span>
          {result.processing_time_ms && (
            <span style={{ fontFamily: T.fontMono, fontSize: '0.62rem', color: T.t3 }}>
              · {result.processing_time_ms.toFixed(0)}ms
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setEditMode(!editMode)} style={{
            padding: '5px 12px', borderRadius: 6,
            background: editMode ? T.blueDim : 'rgba(255,255,255,0.04)',
            border: `1px solid ${editMode ? T.blue + '40' : T.border}`,
            color: editMode ? T.blue : T.t2,
            fontFamily: T.fontMono, fontSize: '0.68rem', cursor: 'pointer',
          }}>
            {editMode ? '👁 Preview' : '✏️ Edit'}
          </button>
          <CopyBtn text={displayText} label="Copy" color={T.emerald} />
          <button onClick={downloadMd} style={{
            padding: '5px 12px', borderRadius: 6,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
            color: T.t2, fontFamily: T.fontMono, fontSize: '0.68rem', cursor: 'pointer',
          }}>⬇ .md</button>
          <button onClick={downloadJson} style={{
            padding: '5px 12px', borderRadius: 6,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
            color: T.t2, fontFamily: T.fontMono, fontSize: '0.68rem', cursor: 'pointer',
          }}>⬇ .json</button>
        </div>
      </div>

      {/* Body */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderTop: 'none',
        borderRadius: '0 0 14px 14px', overflow: 'hidden',
      }}>
        {!consultingMode && Object.keys(metrics).length > 0 && (
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}` }}>
            <SectionLabel accent={T.gold}>Metrics Dashboard</SectionLabel>
            <MetricsDashboard metrics={metrics} />
          </div>
        )}
        {!consultingMode && result.charts && result.charts.length > 0 && (
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}` }}>
            <SectionLabel accent={T.blue}>Data Visualizations</SectionLabel>
            {result.charts.map((chart, i) => <ChartBlock key={i} chart={chart} />)}
          </div>
        )}
        <div style={{ padding: '28px 32px', maxHeight: 680, overflowY: 'auto' }}>
          {editMode ? (
            <textarea
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              style={{
                width: '100%', minHeight: 500, resize: 'vertical',
                background: T.surface, border: `1px solid ${T.borderHi}`,
                borderRadius: 8, padding: '14px 16px',
                fontFamily: T.fontMono, fontSize: '0.8rem', color: T.t1,
                outline: 'none', lineHeight: 1.7,
              }}
            />
          ) : (
            <div style={{ fontFamily: T.fontDisplay, fontSize: '0.93rem', color: T.t1, lineHeight: 1.8 }}>
              {consultingMode
                ? <ReactMarkdown components={mdComponents}>{extractExecutiveView(displayText)}</ReactMarkdown>
                : <ReactMarkdown components={mdComponents}>{displayText}</ReactMarkdown>
              }
            </div>
          )}
        </div>
        {result.suggested_visuals?.length > 0 && (
          <div style={{
            padding: '14px 18px', borderTop: `1px solid ${T.border}`,
            background: T.surface,
          }}>
            <SectionLabel accent={T.gold}>Suggested Visualizations</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {result.suggested_visuals.map((v, i) => (
                <div key={i} style={{
                  padding: '4px 12px', borderRadius: 5,
                  background: T.goldDim, border: `1px solid ${T.gold}35`,
                  fontFamily: T.fontMono, fontSize: '0.72rem', color: T.gold,
                }}>📊 {v}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function extractExecutiveView(text) {
  const execMatch     = text.match(/\*\*Executive Summary\*\*([\s\S]*?)(?=\*\*Key Findings\*\*)/i)
  const findingsMatch = text.match(/\*\*Key Findings\*\*([\s\S]*?)(?=\*\*Strategic Analysis\*\*|\*\*Risks\*\*)/i)
  const verdictMatch  = text.match(/\*\*Investment Verdict\*\*([\s\S]*?)(?=\*\*Recommendations\*\*|\*\*Next Steps\*\*)/i)
  let out = ''
  if (execMatch)     out += `**Executive Summary**${execMatch[1]}`
  if (findingsMatch) out += `**Key Findings**${findingsMatch[1]}`
  if (verdictMatch)  out += `**Investment Verdict**${verdictMatch[1]}`
  return out || text
}

const mdComponents = {
  h1: ({ children }) => (
    <h1 style={{
      fontFamily: "'Syne', sans-serif", fontWeight: 800,
      fontSize: '1.3rem', color: '#dde3f0',
      borderBottom: `1px solid #1a2838`,
      paddingBottom: 8, marginTop: 24, marginBottom: 14,
    }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{
      fontFamily: "'Syne', sans-serif", fontWeight: 700,
      fontSize: '1.05rem', color: '#22d3a5',
      marginTop: 22, marginBottom: 10,
    }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{
      fontFamily: "'Syne', sans-serif", fontWeight: 600,
      fontSize: '0.95rem', color: '#4f8ef7',
      marginTop: 18, marginBottom: 8,
    }}>{children}</h3>
  ),
  strong: ({ children }) => (
    <strong style={{ color: '#22d3a5', fontWeight: 700 }}>{children}</strong>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: 6, color: '#dde3f0', lineHeight: 1.7 }}>{children}</li>
  ),
  p: ({ children }) => (
    <p style={{ marginBottom: 14, color: '#dde3f0', lineHeight: 1.8 }}>{children}</p>
  ),
}

/* ── Live preview ── */
function LivePreview({ title, execSummary, bullets, metrics, sections }) {
  const previewMd = [
    title ? `# ${title}` : '',
    execSummary ? `\n${execSummary}\n` : '',
    bullets.length > 0 ? `\n**Key Points:**\n${bullets.map(b => `- ${b}`).join('\n')}` : '',
    Object.keys(metrics).length > 0
      ? `\n**Metrics:**\n${Object.entries(metrics).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}`
      : '',
    sections.length > 0
      ? sections.map(s => `\n**${s.heading}**\n${s.content}`).join('\n')
      : '',
  ].filter(Boolean).join('\n')

  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 12, overflow: 'hidden', height: '100%',
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.gold }} />
        <span style={{ fontFamily: T.fontMono, fontSize: '0.63rem', color: T.t2, letterSpacing: '0.1em' }}>
          LIVE PREVIEW
        </span>
      </div>
      <div style={{ padding: '18px 20px', overflowY: 'auto', maxHeight: 500 }}>
        {previewMd.trim() ? (
          <div style={{ fontFamily: T.fontDisplay, fontSize: '0.85rem', color: T.t1, lineHeight: 1.7 }}>
            <ReactMarkdown components={mdComponents}>{previewMd}</ReactMarkdown>
          </div>
        ) : (
          <div style={{ color: T.t3, fontFamily: T.fontMono, fontSize: '0.75rem', textAlign: 'center', marginTop: 40 }}>
            Start filling fields to see a live preview…
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Main ReportPage component
═══════════════════════════════════════════════════════════════════════════════ */
export default function ReportPage() {
  const [title, setTitle]             = useState('Strategic Market Entry Analysis')
  const [execSummary, setExecSummary] = useState('')
  const [bullets, setBullets]         = useState([])
  const [metrics, setMetrics]         = useState({})
  const [sections, setSections]       = useState([])

  const [showPreview, setShowPreview]       = useState(false)
  const [consultingMode, setConsultingMode] = useState(false)

  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')

  const handleGenerate = useCallback(async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const payload = { title, executive_summary: execSummary, bullet_points: bullets, metrics, sections }
      const res = await runReportGeneration(payload)
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [title, execSummary, bullets, metrics, sections])

  const hasContent = title.trim() || execSummary.trim() || bullets.length > 0 || Object.keys(metrics).length > 0

  return (
    <div style={{
      background: T.bg, minHeight: '100vh',
      padding: '28px 24px', fontFamily: T.fontDisplay, color: T.t1,
    }}>
      <FontLoader />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg, #22d3a5 0%, #4f8ef7 100%)',
              borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}>📝</div>
            <h1 style={{
              fontFamily: T.fontDisplay, fontWeight: 800, fontSize: '1.5rem',
              letterSpacing: '-0.03em', color: T.t1, margin: 0,
            }}>Report Generator</h1>
          </div>
          <p style={{ fontFamily: T.fontMono, fontSize: '0.73rem', color: T.t2, margin: 0 }}>
            Structure your inputs · Generate McKinsey-grade consulting reports
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: '0.65rem', color: T.t2 }}>Mode:</span>
            <ToggleGroup
              options={[{ value: false, label: 'Full' }, { value: true, label: 'Executive' }]}
              value={consultingMode}
              onChange={v => setConsultingMode(v === 'true' || v === true)}
            />
          </div>
          <button onClick={() => setShowPreview(p => !p)} style={{
            padding: '6px 14px', borderRadius: 7,
            background: showPreview ? T.blueDim : 'rgba(255,255,255,0.04)',
            border: `1px solid ${showPreview ? T.blue + '40' : T.border}`,
            color: showPreview ? T.blue : T.t2,
            fontFamily: T.fontMono, fontSize: '0.7rem', cursor: 'pointer',
          }}>
            {showPreview ? '⊞ Hide Preview' : '⊞ Show Preview'}
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: result
          ? '360px 1fr'
          : showPreview ? '380px 1fr' : '400px 1fr',
        gap: 18, maxWidth: 1400,
        transition: 'grid-template-columns 0.3s ease',
      }}>

        {/* ── LEFT: Input panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Title */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
            <SectionLabel accent={T.emerald}>Report Title</SectionLabel>
            <Input placeholder="Report title" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* Executive context */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
            <SectionLabel>Executive Context</SectionLabel>
            <textarea
              placeholder="Brief context for the analyst (optional)…"
              value={execSummary}
              onChange={e => setExecSummary(e.target.value)}
              rows={3}
              style={{
                width: '100%', resize: 'vertical',
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 7, padding: '8px 12px',
                fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t1,
                outline: 'none', lineHeight: 1.6,
              }}
            />
          </div>

          {/* Key Points */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
            <SectionLabel accent={T.blue}>Key Points</SectionLabel>
            <BulletEditor bullets={bullets} setBullets={setBullets} />
          </div>

          {/* Metrics */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
            <SectionLabel accent={T.gold}>Metrics & KPIs</SectionLabel>
            <MetricsEditor metrics={metrics} setMetrics={setMetrics} />
          </div>

          {/* Custom Sections */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
            <SectionLabel>Custom Sections</SectionLabel>
            <SectionsEditor sections={sections} setSections={setSections} />
          </div>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={loading || !hasContent}
            style={{
              padding: '13px', borderRadius: 10,
              background: (loading || !hasContent) ? T.t4 : T.emerDim,
              border: `1px solid ${(loading || !hasContent) ? T.border : 'rgba(34,211,165,0.3)'}`,
              color: (loading || !hasContent) ? T.t2 : T.emerald,
              fontFamily: T.fontMono, fontSize: '0.85rem', fontWeight: 700,
              cursor: (loading || !hasContent) ? 'not-allowed' : 'pointer',
              letterSpacing: '0.04em', transition: 'all 0.2s',
            }}
          >
            {loading ? '⟳ Generating Report…' : 'Generate Consulting Report →'}
          </button>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: T.redDim, border: `1px solid rgba(224,94,114,0.2)`,
              fontFamily: T.fontMono, fontSize: '0.74rem', color: T.red,
            }}>{error}</div>
          )}
        </div>

        {/* ── RIGHT: Report / Preview ── */}
        <div>
          {result ? (
            <ReportView result={result} consultingMode={consultingMode} />
          ) : showPreview && !loading ? (
            <LivePreview
              title={title} execSummary={execSummary}
              bullets={bullets} metrics={metrics} sections={sections}
            />
          ) : loading ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', minHeight: 420, gap: 16,
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                border: `3px solid ${T.border}`, borderTopColor: T.emerald,
                animation: 'spin 0.9s linear infinite',
              }} />
              <div style={{ fontFamily: T.fontMono, fontSize: '0.8rem', color: T.t2 }}>
                Consulting LLM · Structuring report…
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', minHeight: 420, gap: 12, opacity: 0.4,
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
            }}>
              <div style={{ fontSize: '3.5rem' }}>📄</div>
              <div style={{ fontFamily: T.fontMono, fontSize: '0.78rem', color: T.t2, textAlign: 'center', lineHeight: 1.7 }}>
                Fill in the fields on the left<br />and click Generate to create your report.
                <br /><br />
                <span style={{ color: T.t3 }}>Toggle "Show Preview" to see a live structure preview.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}