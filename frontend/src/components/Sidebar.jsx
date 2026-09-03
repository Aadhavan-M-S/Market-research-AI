import { useState } from 'react'
import {
  LayoutDashboard, Search, FileText, GitBranch,
  Star, TrendingUp, Zap, Users, Shield,
  ChevronLeft, ChevronRight, Cpu,
  Database, ClipboardList, FileSpreadsheet, AlertTriangle,
} from 'lucide-react'

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    color: '#00F0FF',
  },
  {
    id: 'market-research',
    label: 'Spectra',
    icon: Search,
    color: '#00F0FF',
    tag: 'NER · Sentiment',
  },
  {
    id: 'doc-compare',
    label: 'Doc Comparator',
    icon: FileText,
    color: '#8B5CF6',
    tag: 'TF-IDF · Morph',
  },
  {
    id: 'knowledge-graph',
    label: 'Knowledge Graph',
    icon: GitBranch,
    color: '#60a5fa',
    tag: 'DEP · POS',
  },
  {
    id: 'review-analysis',
    label: 'Review Analysis',
    icon: Star,
    color: '#F59E0B',
    tag: 'Word2Vec · BoW',
  },
  {
    id: 'trend-spotting',
    label: 'Trend Spotting',
    icon: TrendingUp,
    color: '#34d399',
    tag: 'LDA · N-gram',
  },
  {
    id: 'brand-association',
    label: 'Brand Association',
    icon: Zap,
    color: '#F472B6',
    tag: 'VSM · Thematic',
  },
  {
    id: 'persona-generator',
    label: 'Persona Generator',
    icon: Users,
    color: '#8B5CF6',
    tag: 'Clustering · Emb',
  },
  {
    id: 'compliance-check',
    label: 'Compliance Check',
    icon: Shield,
    color: '#F59E0B',
    tag: 'DEP · NER',
  },
  // ── Enterprise Features ───────────────────────────────────────────────────
  {
    id: 'rag-engine',
    label: 'RAG Engine',
    icon: Database,
    color: '#00F0FF',
    tag: 'FAISS · HF Embed',
  },
  {
    id: 'due-diligence',
    label: 'Due Diligence',
    icon: ClipboardList,
    color: '#34d399',
    tag: 'PDF · NER · LLM',
  },
  {
    id: 'report-generator',
    label: 'Report Generator',
    icon: FileSpreadsheet,
    color: '#F472B6',
    tag: 'LLM · Consulting',
  },
  {
    id: 'risk-monitoring',
    label: 'Risk Monitoring',
    icon: AlertTriangle,
    color: '#f87171',
    tag: 'RSS · Supply Chain',
  },
]

export default function Sidebar({ activeView, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className="glass-panel"
      style={{
        width: collapsed ? 68 : 250,
        transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        zIndex: 10,
        background: 'rgba(10, 15, 30, 0.9)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* ── Logo Area ──────────────────────────────────────────────────── */}
      <div style={{
        padding: collapsed ? '24px 0' : '24px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        minHeight: 72,
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34,
              background: 'linear-gradient(135deg, #00F0FF 0%, #8B5CF6 100%)',
              borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 0 18px rgba(0, 240, 255, 0.25), 0 0 6px rgba(139, 92, 246, 0.2)',
            }}>
              <Cpu size={16} color="#fff" />
            </div>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.1rem',
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              background: 'linear-gradient(135deg, #00F0FF 0%, #8B5CF6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>SPECTRA</span>
          </div>
        )}
        {collapsed && (
          <div style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, #00F0FF 0%, #8B5CF6 100%)',
            borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 18px rgba(0, 240, 255, 0.25), 0 0 6px rgba(139, 92, 246, 0.2)',
          }}>
            <Cpu size={16} color="#fff" />
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 5,
              borderRadius: 7,
              display: 'flex',
              transition: 'all 280ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#00F0FF'
              e.currentTarget.style.background = 'rgba(0, 240, 255, 0.06)'
              e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.15)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)'
            }}
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* ── Expand button (collapsed) ──────────────────────────────────── */}
      {collapsed && (
        <div style={{ padding: '10px 0', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setCollapsed(false)}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 5,
              borderRadius: 7,
              display: 'flex',
              transition: 'all 280ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#00F0FF'
              e.currentTarget.style.background = 'rgba(0, 240, 255, 0.06)'
              e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.15)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)'
            }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* ── Navigation (expanded) ──────────────────────────────────────── */}
      {!collapsed && (
        <div style={{ padding: '8px 0', flex: 1, overflowY: 'auto' }}>
          <div style={{
            padding: '6px 20px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.62rem',
            fontWeight: 500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            Navigation
          </div>

          {NAV_ITEMS.map((item, i) => {
            const Icon = item.icon
            const isActive = activeView === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 20px',
                  background: isActive ? 'rgba(0, 240, 255, 0.06)' : 'none',
                  border: 'none',
                  borderLeft: isActive
                    ? `2px solid ${item.color}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                  animation: `slideInLeft ${0.2 + i * 0.04}s ease both`,
                  boxShadow: isActive
                    ? `inset 3px 0 12px -4px ${item.color}30`
                    : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
                    e.currentTarget.style.borderLeftColor = `${item.color}50`
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.borderLeftColor = 'transparent'
                  }
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: item.tag ? 3 : 0,
                }}>
                  <Icon
                    size={15}
                    color={isActive ? item.color : 'var(--text-muted)'}
                    style={{
                      filter: isActive ? `drop-shadow(0 0 4px ${item.color}60)` : 'none',
                      transition: 'filter 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    transition: 'color 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}>
                    {item.label}
                  </span>
                </div>
                {item.tag && (
                  <div style={{
                    marginLeft: 25,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.62rem',
                    color: isActive ? item.color : 'var(--text-muted)',
                    opacity: isActive ? 1 : 0.7,
                    letterSpacing: '0.05em',
                    transition: 'color 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}>
                    {item.tag}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Collapsed nav icons ────────────────────────────────────────── */}
      {collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const isActive = activeView === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={item.label}
                style={{
                  width: '100%',
                  padding: '12px 0',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  background: isActive ? 'rgba(0, 240, 255, 0.08)' : 'none',
                  border: 'none',
                  borderLeft: isActive
                    ? `2px solid ${item.color}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'none'
                  }
                }}
              >
                <Icon
                  size={18}
                  color={isActive ? item.color : 'var(--text-muted)'}
                  style={{
                    filter: isActive ? `drop-shadow(0 0 6px ${item.color}50)` : 'none',
                    transition: 'filter 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
              </button>
            )
          })}
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {!collapsed && (
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
          }}>
            v1.0.0 · SPECTRA Platform
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.62rem',
            color: 'rgba(0, 240, 255, 0.45)',
            marginTop: 3,
            letterSpacing: '0.04em',
          }}>
            12 Agents · RAG · Risk · Reports
          </div>
        </div>
      )}
    </aside>
  )
}
