import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import ConsultancyDashboard from './components/ConsultancyDashboard.jsx'
import MarketResearch    from './components/agents/MarketResearch.jsx'
import DocComparator     from './components/agents/DocComparator.jsx'
import KnowledgeGraph    from './components/agents/KnowledgeGraph.jsx'
import ReviewAnalysis    from './components/agents/ReviewAnalysis.jsx'
import TrendSpotting     from './components/agents/TrendSpotting.jsx'
import BrandAssociation  from './components/agents/BrandAssociation.jsx'
import PersonaGenerator  from './components/agents/PersonaGenerator.jsx'
import ComplianceChecker from './components/agents/ComplianceChecker.jsx'
import RagPage           from './components/agents/RagPage.jsx'
import DiligencePage     from './components/agents/DiligencePage.jsx'
import ReportPage        from './components/agents/ReportPage.jsx'
import RiskPage          from './components/agents/RiskPage.jsx'

const VIEWS = {
  dashboard:           ConsultancyDashboard,
  'market-research':   MarketResearch,
  'doc-compare':       DocComparator,
  'knowledge-graph':   KnowledgeGraph,
  'review-analysis':   ReviewAnalysis,
  'trend-spotting':    TrendSpotting,
  'brand-association': BrandAssociation,
  'persona-generator': PersonaGenerator,
  'compliance-check':  ComplianceChecker,
  // Enterprise Features
  'rag-engine':        RagPage,
  'due-diligence':     DiligencePage,
  'report-generator':  ReportPage,
  'risk-monitoring':   RiskPage,
}

export default function App() {
  const [activeView, setActiveView] = useState('dashboard')

  const navigate = useCallback((view) => setActiveView(view), [])

  const ActiveComponent = VIEWS[activeView] || ConsultancyDashboard

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Floating aurora orbs */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0, 240, 255, 0.04) 0%, transparent 70%)',
          top: '-10%',
          left: '-5%',
          animation: 'floatUp 20s ease-in-out infinite',
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.035) 0%, transparent 70%)',
          bottom: '-10%',
          right: '-5%',
          animation: 'floatUp 25s ease-in-out infinite reverse',
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(244, 114, 182, 0.025) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          animation: 'floatUp 30s ease-in-out infinite',
          filter: 'blur(80px)',
        }} />
      </div>

      <Sidebar activeView={activeView} onNavigate={navigate} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <Header activeView={activeView} onNavigate={navigate} />

        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          <ActiveComponent onNavigate={navigate} />
        </main>
      </div>
    </div>
  )
}
