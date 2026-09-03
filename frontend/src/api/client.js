import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 999_000, // 2 min for heavy LLM calls
  headers: { 'Content-Type': 'application/json' },
})

// ── Response interceptor for unified error shape ──────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err?.response?.data?.detail ||
      err?.response?.data?.message ||
      err?.message ||
      'An unexpected error occurred'
    return Promise.reject(new Error(msg))
  }
)

// ── Health ────────────────────────────────────────────────────────────────
export const fetchHealth = () => api.get('/health').then((r) => r.data)

// ── NLP Map ───────────────────────────────────────────────────────────────
export const fetchNlpMap = () => api.get('/nlp-map').then((r) => r.data)

// ── Agent calls ───────────────────────────────────────────────────────────
export const runMarketResearch    = (payload) => api.post('/spectra',  payload).then((r) => r.data)
export const runDocComparator     = (payload) => api.post('/doc-compare',       payload).then((r) => r.data)
export const runKnowledgeGraph    = (payload) => api.post('/knowledge-graph',   payload).then((r) => r.data)
export const runReviewAnalysis    = (payload) => api.post('/review-analysis',   payload).then((r) => r.data)
export const runTrendSpotting     = (payload) => api.post('/trend-spotting',    payload).then((r) => r.data)
export const runBrandAssociation  = (payload) => api.post('/brand-association', payload).then((r) => r.data)
export const runPersonaGenerator  = (payload) => api.post('/persona-generator', payload).then((r) => r.data)
export const runComplianceCheck   = (payload) => api.post('/compliance-check',  payload).then((r) => r.data)

// ── Enterprise Features ───────────────────────────────────────────────────────

// Feature 1: RAG Engine
export const runRagQuery    = (payload) => api.post('/rag/query',        payload).then((r) => r.data)
export const ragIngestText  = (payload) => api.post('/rag/ingest',       payload).then((r) => r.data)
export const ragIngestFile  = (formData) =>
  api.post('/rag/ingest/file', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
export const getRagStats    = ()         => api.get('/rag/stats').then((r) => r.data)

// Feature 2: Due Diligence
export const runDiligenceAnalysis = (formData) =>
  api.post('/diligence/analyze', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)

// Feature 3: Report Generator
export const runReportGeneration = (payload) => api.post('/report/generate', payload).then((r) => r.data)

// Feature 4: Risk Monitoring
export const getRiskAlerts = () => api.get('/risk/alerts').then((r) => r.data)
