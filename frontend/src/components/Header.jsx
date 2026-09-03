import { useState, useEffect } from 'react';
import { Activity, Circle, ExternalLink, Wifi, WifiOff } from 'lucide-react';
import { fetchHealth } from '../api/client.js';

const VIEW_LABELS = {
  'dashboard':         'Platform Overview',
  'market-research':   'Spectra Agent',
  'doc-compare':       'Documentation Comparator',
  'knowledge-graph':   'Knowledge Graph Generator',
  'review-analysis':   'Product Review Analysis',
  'trend-spotting':    'Trend Spotting Engine',
  'brand-association': 'Brand Association NLP',
  'persona-generator': 'Persona Generator',
  'compliance-check':  'Regulatory Compliance Checker',
};

export default function Header({ activeView, onNavigate }) {
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkHealth = async () => {
      try {
        setChecking(true);
        const data = await fetchHealth();
        if (mounted) {
          setHealth(data);
          setChecking(false);
        }
      } catch {
        if (mounted) {
          setHealth(null);
          setChecking(false);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  /* ── Derived status flags ── */
  const ollamaOnline = health?.ollama === true;
  const apiOnline    = health?.status === 'online';

  /* ── Status dot style ── */
  const dotStyle = checking
    ? { color: 'rgba(255,255,255,0.35)' }
    : ollamaOnline
      ? { color: '#00F0FF', filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.6))' }
      : { color: '#f87171', filter: 'drop-shadow(0 0 8px rgba(248,113,113,0.6))' };

  return (
    <header
      className="glass-panel--top"
      style={{
        height: 62,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: 'rgba(5, 8, 22, 0.75)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* ── Left: Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onNavigate('dashboard')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "var(--font-display, 'Space Grotesk', system-ui, sans-serif)",
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--text-muted, rgba(255,255,255,0.35))',
            letterSpacing: '0.06em',
            padding: 0,
            transition: 'color var(--transition-fast, 280ms cubic-bezier(0.4,0,0.2,1))',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary, #00F0FF)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, rgba(255,255,255,0.35))')}
        >
          SPECTRA
        </button>

        {activeView !== 'dashboard' && (
          <>
            <span
              style={{
                color: 'var(--text-muted, rgba(255,255,255,0.35))',
                fontSize: '0.85rem',
                fontWeight: 300,
                userSelect: 'none',
              }}
            >
              /
            </span>

            <span
              style={{
                fontFamily: "var(--font-display, 'Space Grotesk', system-ui, sans-serif)",
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-primary, rgba(255,255,255,0.95))',
                letterSpacing: '-0.01em',
              }}
            >
              {VIEW_LABELS[activeView] || activeView}
            </span>
          </>
        )}
      </div>

      {/* ── Right: Status indicators ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Ollama status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              fontSize: '0.7rem',
              fontWeight: 500,
              color: 'var(--text-muted, rgba(255,255,255,0.35))',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            OLLAMA
          </span>
          <Circle size={8} fill="currentColor" style={dotStyle} />
        </div>

        {/* Vertical divider */}
        <div
          style={{
            width: 1,
            height: 20,
            background: 'rgba(255,255,255,0.06)',
          }}
        />

        {/* API status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {checking ? (
            <>
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid rgba(255,255,255,0.15)',
                  borderTopColor: 'var(--accent-primary, #00F0FF)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  color: 'var(--text-muted, rgba(255,255,255,0.35))',
                  letterSpacing: '0.08em',
                }}
              >
                CHECKING
              </span>
            </>
          ) : apiOnline ? (
            <>
              <Wifi size={14} style={{ color: '#00F0FF' }} />
              <span
                style={{
                  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  color: '#5eead4',
                  letterSpacing: '0.08em',
                }}
              >
                ONLINE
              </span>
            </>
          ) : (
            <>
              <WifiOff size={14} style={{ color: '#f87171' }} />
              <span
                style={{
                  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  color: '#f87171',
                  letterSpacing: '0.08em',
                }}
              >
                OFFLINE
              </span>
            </>
          )}
        </div>

        {/* Agents count */}
        {health?.agents && (
          <>
            {/* Vertical divider */}
            <div
              style={{
                width: 1,
                height: 20,
                background: 'rgba(255,255,255,0.06)',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={14} style={{ color: '#00F0FF' }} />
              <span
                style={{
                  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  color: '#5eead4',
                  letterSpacing: '0.08em',
                }}
              >
                {health.agents.length} AGENTS READY
              </span>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
