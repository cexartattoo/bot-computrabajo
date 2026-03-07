import { useState, useEffect, useRef } from 'react'
import { useBot } from '../context/BotContext'

const API = '/api'
const STATUS_COLORS = {
    idle: 'bg-slate-600', running: 'bg-green-500 animate-pulse',
    paused: 'bg-yellow-500 animate-pulse', paused_user: 'bg-yellow-500',
    error: 'bg-red-500',
    stopping: 'bg-orange-500 animate-pulse',
    disconnected: 'bg-orange-500 animate-pulse',
}
const STATUS_LABELS = {
    idle: 'Inactivo', running: 'Corriendo',
    paused: 'Esperando confirmacion', paused_user: 'Pausado',
    error: 'Error',
    stopping: 'Deteniendo...',
    disconnected: 'Conectando con API...',
}

function formatElapsed(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
}

export default function Dashboard() {
    const { status, setStatus, logs, clearLogs, aiProcessing, reviewQueue, popReview, reportUrl } = useBot()

    // Dashboard Controls
    const [mode, setMode] = useState('dry-run-llm')
    const [maxApps, setMaxApps] = useState(5)
    const [keyword, setKeyword] = useState('')
    const [cv, setCv] = useState('')
    const [cvs, setCvs] = useState([])
    const [loading, setLoading] = useState(false)
    const [elapsed, setElapsed] = useState(0)

    // Review States
    const [currentReview, setCurrentReview] = useState(null)
    const [editedAnswers, setEditedAnswers] = useState({})
    const [submitting, setSubmitting] = useState(false)
    const [selectedCv, setSelectedCv] = useState('')
    const [missingData, setMissingData] = useState(null)
    const [missingAnswer, setMissingAnswer] = useState('')
    const [detectedQuestions, setDetectedQuestions] = useState(null)
    const [timeLeft, setTimeLeft] = useState(300)
    const [reviewTimeLeft, setReviewTimeLeft] = useState(300)
    const [jobExpanded, setJobExpanded] = useState(true)
    const [viewMode, setViewMode] = useState('original')
    const [openSections, setOpenSections] = useState(new Set(['description']))
    const [acknowledgedCompletion, setAcknowledgedCompletion] = useState(false)

    // Logs State
    const logsRef = useRef(null)
    const [userScrolled, setUserScrolled] = useState(false)

    useEffect(() => {
        fetch(`${API}/config/cvs`).then(r => r.json()).then(d => setCvs(d.cvs || [])).catch(() => { })
    }, [])

    useEffect(() => {
        if (status.status === 'running' || status.status === 'paused') {
            const timer = setInterval(() => setElapsed(prev => prev + 1), 1000)
            return () => clearInterval(timer)
        } else if (status.status === 'idle' || status.status === 'error' || status.status === 'disconnected') {
            // Keep elapsed if completed, reset if starting fresh
            if (status.apps_this_session === 0) setElapsed(0)
        }
    }, [status.status, status.apps_this_session])

    // Reset acknowledgment when a new run starts
    useEffect(() => {
        if (status.status === 'running') {
            setAcknowledgedCompletion(false)
        }
    }, [status.status])

    // Auto-scroll sticky logs unless user scrolled up
    useEffect(() => {
        if (!userScrolled && logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight
        }
    }, [logs, userScrolled])

    const handleLogScroll = () => {
        if (!logsRef.current) return
        const { scrollTop, scrollHeight, clientHeight } = logsRef.current
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 10
        setUserScrolled(!isAtBottom)
    }

    // Review Queue processor
    useEffect(() => {
        if (reviewQueue.length > 0) {
            const latest = reviewQueue[reviewQueue.length - 1]
            if (latest.type === 'questions_detected') {
                setDetectedQuestions(latest)
                return
            }
            if (latest.type === 'missing_data') {
                setMissingData(latest)
                return
            }
            setDetectedQuestions(null)
            setCurrentReview(latest)
            initEditableAnswers(latest.answers)
        }
    }, [reviewQueue])

    useEffect(() => {
        if (!currentReview && status.pending_confirmation?.type === 'review_request') {
            const data = status.pending_confirmation.data
            setCurrentReview(data)
            initEditableAnswers(data?.answers)
        }
    }, [status.pending_confirmation, currentReview])

    // Missing Data Timer
    useEffect(() => {
        if (!missingData) {
            setTimeLeft(300)
            return
        }
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [missingData])

    const initEditableAnswers = (answers) => {
        if (!answers) return
        const editable = {}
        Object.entries(answers).forEach(([q, data]) => {
            editable[q] = typeof data === 'object' ? (data.answer || data.respuesta || '') : String(data)
        })
        setEditedAnswers(editable)
    }

    const loadNext = () => {
        popReview()
        setCurrentReview(null)
        setEditedAnswers({})
    }

    // Bot Actions
    const startBot = async () => {
        setLoading(true)
        setElapsed(0)
        setCurrentReview(null)
        setMissingData(null)
        setDetectedQuestions(null)
        const body = { mode, max_apps: maxApps || null, keyword: keyword || null, cv: cv || null }
        const res = await fetch(`${API}/bot/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const data = await res.json()
        setStatus(prev => ({ ...prev, ...data }))
        setLoading(false)
    }

    const stopBot = async () => {
        setLoading(true)
        const res = await fetch(`${API}/bot/stop`, { method: 'POST' })
        const data = await res.json()
        setStatus(prev => ({ ...prev, ...data }))
        setLoading(false)
    }

    const pauseResumeBot = async () => {
        const endpoint = status.status === 'paused_user' ? `${API}/bot/resume` : `${API}/bot/pause`
        setLoading(true)
        await fetch(endpoint, { method: 'POST' })
        const s = await fetch(`${API}/bot/status`).then(r => r.json())
        setStatus(prev => ({ ...prev, ...s }))
        setLoading(false)
    }

    // Review Actions
    const handleApprove = async () => {
        setSubmitting(true)
        await fetch(`${API}/bot/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved: true, edited_answers: editedAnswers, cv: selectedCv || null }),
        })
        setSubmitting(false)
        loadNext()
    }

    const handleReject = async () => {
        setSubmitting(true)
        await fetch(`${API}/bot/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved: false }),
        })
        setSubmitting(false)
        loadNext()
    }

    const sendMissingData = async () => {
        if (!missingAnswer.trim()) return
        await fetch(`${API}/bot/respond_missing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer: missingAnswer }),
        })
        setMissingData(null)
        setMissingAnswer('')
    }

    // Manual Review Timer
    useEffect(() => {
        if (!currentReview || status.status === 'paused_user') {
            setReviewTimeLeft(300)
            return
        }
        const timer = setInterval(() => {
            setReviewTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer)
                    handleReject() // Auto reject when timeout
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [currentReview, status.status, handleReject])

    const updateAnswer = (question, value) => {
        setEditedAnswers(prev => ({ ...prev, [question]: value }))
    }

    // Determine Stage
    let stage = 'stopped'
    const isRunningState = status.status === 'running'
    const isPausedState = status.status === 'paused_user' || status.status === 'paused'

    if (missingData || currentReview || status.pending_confirmation) {
        stage = 'review'
    } else if (isPausedState) {
        stage = 'paused'
    } else if (isRunningState) {
        if (aiProcessing || detectedQuestions) {
            stage = 'ai_processing'
        } else if (status.apps_this_session === 0 && elapsed < 8 && logs.length < 20) {
            stage = 'starting'
        } else {
            stage = 'searching'
        }
    } else if (status.status === 'idle' && status.apps_this_session > 0 && !acknowledgedCompletion) {
        stage = 'completed'
    }
    const isAlreadyApplied = currentReview?.job?.status === 'aplicado_anteriormente' || currentReview?.job?.status === 'already_applied';
    const aiSummaryStr = typeof currentReview?.job?.ai_summary === 'object'
        ? currentReview?.job?.ai_summary?.description
        : currentReview?.job?.ai_summary;
    const hasEmptyData = currentReview?.job &&
        (!currentReview.job.description || currentReview.job.description.trim() === '') &&
        (!currentReview.job.quick_facts || Object.keys(currentReview.job.quick_facts).length === 0) &&
        (!aiSummaryStr || aiSummaryStr === 'Resumen IA no disponible.');

    // Styles
    const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
    const inputStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

    return (
        <div className="space-y-6 max-w-5xl mx-auto flex flex-col h-[calc(100vh-100px)]">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <h1 className="text-2xl font-bold">Panel Unificado</h1>
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[status.status] || 'bg-gray-500'}`} />
                    <span className="text-sm font-semibold">{STATUS_LABELS[status.status] || status.status}</span>
                    {(isRunningState || isPausedState) && (
                        <span className="px-2 py-0.5 text-xs font-mono rounded ml-2" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>
                            {formatElapsed(elapsed)} transcurrido
                        </span>
                    )}
                </div>
            </div>

            {/* Dynamic Stage Area */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-2 custom-scrollbar">

                {stage === 'stopped' && (
                    <div className="rounded-xl p-6 space-y-6" style={card}>
                        <div className="text-center pb-4">
                            <h2 className="text-xl font-bold mb-2">Iniciar Nueva Sesion</h2>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Configura los parametros y lanza el bot para comenzar a buscar ofertas.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Modo</label>
                                <select value={mode} onChange={e => setMode(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
                                    <option value="apply">Aplicar Automaticamente</option>
                                    <option value="dry-run-llm">Dry-Run (Solo IA, no aplicar)</option>
                                    <option value="semi-auto">Semi-Auto (Revision manual)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Max. aplicaciones</label>
                                <input type="number" value={maxApps} onChange={e => setMaxApps(Number(e.target.value))} className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} min={1} />
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Keyword (opcional)</label>
                                <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="ej: ingeniero" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>CV</label>
                                <select value={cv} onChange={e => setCv(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
                                    <option value="">Auto (default)</option>
                                    {cvs.map(c => <option key={c.filename} value={c.filename}>{c.filename}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-center pt-4">
                            <button onClick={startBot} disabled={loading}
                                className="px-8 py-3 rounded-lg font-bold text-sm hover:opacity-90 transition disabled:opacity-50 shadow-lg px-12"
                                style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-purple))', color: '#fff' }}>
                                Lanza el Bot
                            </button>
                        </div>
                        {reportUrl && (
                            <div className="mt-4 p-4 rounded-lg flex justify-between items-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)' }}>
                                <span className="text-sm font-semibold text-green-400">Ultimo informe disponible</span>
                                <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-4 py-2 rounded bg-green-600 text-white hover:bg-green-500 transition">Ver Reporte</a>
                            </div>
                        )}
                    </div>
                )}

                {stage === 'starting' && (
                    <div className="rounded-xl p-12 text-center space-y-6" style={card}>
                        <div className="w-16 h-16 mx-auto rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                        <div>
                            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Iniciando entorno del Bot...</h2>
                            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Abriendo navegador y preparando controles.</p>
                        </div>
                        <button onClick={stopBot} disabled={loading} className="px-6 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--error)', color: '#fff' }}>
                            Cancelar
                        </button>
                    </div>
                )}

                {stage === 'searching' && (
                    <div className="rounded-xl p-8 space-y-6" style={card}>
                        <div className="flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-12 h-12 rounded-full border-4 border-dashed animate-[spin_3s_linear_infinite]" style={{ borderColor: 'var(--accent)' }} />
                            <div>
                                <h2 className="text-xl font-bold" style={{ color: 'var(--accent)' }}>Buscando ofertas...</h2>
                                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Explorando paginas y comprobando requisitos.</p>
                            </div>
                            <div className="flex gap-4 mt-2">
                                <div className="px-4 py-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                                    <span className="block text-2xl font-bold">{status.apps_this_session}</span>
                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Procesadas</span>
                                </div>
                                <div className="px-4 py-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                                    <span className="block text-2xl font-bold">{mode}</span>
                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Modo activo</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button onClick={pauseResumeBot} disabled={loading} className="px-6 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--warning)', color: '#fff' }}>
                                Pausar
                            </button>
                            <button onClick={stopBot} disabled={loading} className="px-6 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--error)', color: '#fff' }}>
                                Detener Bot
                            </button>
                        </div>
                    </div>
                )}

                {stage === 'paused' && (
                    <div className="rounded-xl p-10 text-center space-y-6" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid var(--warning)' }}>
                        <div className="text-5xl">⏸️</div>
                        <div>
                            <h2 className="text-xl font-bold" style={{ color: 'var(--warning)' }}>Bot Pausado</h2>
                            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>El procesamiento esta detenido. Puedes revisar el stream o cambiar de aplicacion.</p>
                        </div>
                        <div className="flex justify-center gap-3">
                            <button onClick={pauseResumeBot} disabled={loading} className="px-8 py-2.5 rounded-lg text-sm font-bold transition hover:opacity-90 shadow-lg" style={{ background: 'var(--success)', color: '#fff' }}>
                                {loading ? 'Reanudando...' : 'Reanudar Bot'}
                            </button>
                            <button onClick={stopBot} disabled={loading} className="px-6 py-2.5 rounded-lg text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--error)', color: '#fff' }}>
                                Detener
                            </button>
                        </div>
                    </div>
                )}

                {stage === 'completed' && (
                    <div className="rounded-xl p-10 text-center space-y-6" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)' }}>
                        <div className="text-5xl">✅</div>
                        <div>
                            <h2 className="text-2xl font-bold" style={{ color: 'var(--success)' }}>Sesion Completada</h2>
                            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Se han procesado {status.apps_this_session} ofertas exitosamente.</p>
                        </div>
                        <button onClick={() => setAcknowledgedCompletion(true)} className="px-8 py-2.5 rounded-lg text-sm font-bold transition hover:opacity-90 shadow-lg" style={{ background: 'var(--success)', color: '#fff' }}>
                            Volver al Inicio
                        </button>
                    </div>
                )}

                {stage === 'ai_processing' && detectedQuestions && (
                    <div className="rounded-xl p-6 space-y-4" style={card}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>IA Asistiendo...</h2>
                        </div>
                        <div className="p-4 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                            <span className="text-sm font-bold block mb-2" style={{ color: 'var(--accent)' }}>Preguntas detectadas ({detectedQuestions.questions?.length || 0}):</span>
                            <div className="space-y-2">
                                {detectedQuestions.questions?.map((q, i) => (
                                    <div key={i} className="text-xs p-2 rounded" style={{ background: 'var(--bg-hover)' }}>{i + 1}. {q.text}</div>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button onClick={pauseResumeBot} disabled={loading} className="px-6 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--warning)', color: '#fff' }}>
                                Pausar
                            </button>
                            <button onClick={stopBot} disabled={loading} className="px-6 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--error)', color: '#fff' }}>
                                Detener Bot
                            </button>
                        </div>
                    </div>
                )}

                {stage === 'ai_processing' && !detectedQuestions && (
                    <div className="rounded-xl p-8 text-center space-y-6" style={card}>
                        <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center relative">
                            <div className="absolute inset-0 rounded-full bg-blue-500 opacity-20 animate-ping" />
                            <span className="text-3xl relative z-10">🧠</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Generando Resumen IA...</h2>
                            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>La inteligencia artificial está analizando los detalles de la oferta.</p>
                        </div>
                        <div className="flex justify-center gap-3 pt-4">
                            <button onClick={pauseResumeBot} disabled={loading} className="px-6 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--warning)', color: '#fff' }}>Pausar</button>
                            <button onClick={stopBot} disabled={loading} className="px-6 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--error)', color: '#fff' }}>Detener Bot</button>
                        </div>
                    </div>
                )}

                {stage === 'review' && missingData && (
                    <div className="rounded-xl p-6 space-y-4" style={{ ...card, borderColor: timeLeft === 0 ? 'var(--error)' : 'var(--warning)' }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${timeLeft === 0 ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
                                <span className="text-sm font-bold" style={{ color: timeLeft === 0 ? 'var(--error)' : 'var(--warning)' }}>Dato Faltante</span>
                            </div>
                            <span className="text-xs font-bold font-mono text-red-400">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                        </div>
                        <div className="text-sm space-y-1 my-3 text-gray-300">
                            <p><strong>Pregunta:</strong> {missingData.question}</p>
                            {missingData.current_answer && <p><strong>Respuesta IA:</strong> <span className="text-red-400">{missingData.current_answer}</span></p>}
                        </div>
                        <input type="text" value={missingAnswer} onChange={e => setMissingAnswer(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendMissingData()}
                            className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2"
                            style={inputStyle} autoFocus />
                        <div className="flex gap-3 pt-2">
                            <button onClick={sendMissingData} disabled={timeLeft === 0} className={`px-6 py-2 rounded-lg font-semibold text-sm transition ${timeLeft === 0 ? 'opacity-50' : 'hover:opacity-90'}`} style={{ background: 'var(--accent)', color: '#fff' }}>Enviar Dato</button>
                            <button onClick={() => { setMissingData(null); setMissingAnswer('') }} disabled={timeLeft === 0} className="px-6 py-2 rounded-lg font-semibold text-sm bg-gray-700 text-white">Omitir</button>
                        </div>
                    </div>
                )}

                {stage === 'review' && !missingData && currentReview && (
                    <div className="space-y-4 pb-10">
                        {/* Compact Review Top Actions */}
                        <div className="flex justify-between items-center px-2">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold" style={{ color: 'var(--accent)' }}>Revision Manual</h2>
                                {!isAlreadyApplied && (
                                    <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-1 mt-1 rounded-full">
                                        <div className={`w-2 h-2 rounded-full ${reviewTimeLeft < 60 ? 'bg-red-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
                                        <span className={`text-xs font-mono font-bold ${reviewTimeLeft < 60 ? 'text-red-400' : 'text-yellow-400'}`}>
                                            {Math.floor(reviewTimeLeft / 60)}:{(reviewTimeLeft % 60).toString().padStart(2, '0')}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {!isAlreadyApplied && (
                                    <>
                                        {isPausedState ? (
                                            <button onClick={pauseResumeBot} disabled={loading} className="px-4 py-1.5 rounded-lg font-bold text-xs bg-yellow-600 text-white hover:bg-yellow-500 transition shadow">{loading ? '...' : 'Reanudar Bot'}</button>
                                        ) : (
                                            <button onClick={pauseResumeBot} disabled={loading} className="px-4 py-1.5 rounded-lg font-bold text-xs bg-yellow-600 text-white hover:bg-yellow-500 transition opacity-80 hover:opacity-100">{loading ? '...' : 'Pausar'}</button>
                                        )}
                                        {reviewQueue.length > 1 && <span className="px-3 py-1.5 text-xs font-bold bg-blue-900 text-blue-300 rounded-full">{reviewQueue.length} pendientes</span>}
                                        <button onClick={handleReject} disabled={submitting} className="px-4 py-1.5 rounded-lg font-bold text-xs bg-red-600 text-white hover:bg-red-500 transition">Ignorar / Filtrar</button>
                                        <button onClick={handleApprove} disabled={submitting} className="px-6 py-1.5 rounded-lg font-bold text-xs shadow hover:opacity-90 transition" style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-purple))', color: '#fff' }}>Enviar Aplicacion</button>
                                    </>
                                )}
                            </div>
                        </div>

                        {isAlreadyApplied ? (
                            <div className="rounded-xl p-6 text-center space-y-4 shadow-lg mx-4 mt-6" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid var(--accent)' }}>
                                <div className="text-4xl animate-bounce mt-2">🔁</div>
                                <h3 className="text-lg font-bold" style={{ color: 'var(--accent)' }}>Ya aplicaste a esta oferta anteriormente</h3>
                                <button onClick={handleReject} disabled={submitting} className="mt-4 px-8 py-2 rounded-lg font-bold text-sm bg-blue-600 text-white hover:bg-blue-500 transition shadow">Continuar</button>
                            </div>
                        ) : (
                            <>
                                {/* Job Snippet */}
                                {currentReview.job && (() => {
                                    const job = currentReview.job;
                                    const qf = job.quick_facts || {};
                                    const aiSummary = (typeof job.ai_summary === 'object' && job.ai_summary !== null) ? job.ai_summary : {};
                                    const aiQf = aiSummary;

                                    const origSections = job.sections || {};
                                    const aiSections = {
                                        description: aiSummary.description || '',
                                        requirements: aiSummary.requirements || '',
                                        responsibilities: aiSummary.responsibilities || '',
                                        benefits: aiSummary.benefits || '',
                                        keywords: aiSummary.keywords || '',
                                    };

                                    return (
                                        <div className="rounded-xl overflow-hidden shadow" style={card}>
                                            <button onClick={() => setJobExpanded(!jobExpanded)}
                                                className="w-full flex items-center justify-between px-5 py-4 text-left hover:opacity-90 transition"
                                                style={{ background: 'var(--bg-card)' }}>
                                                <div>
                                                    <h3 className="font-bold text-lg" style={{ color: 'var(--accent)' }}>{job.title || 'Sin titulo'}</h3>
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        {job.company && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple)' }}>{job.company}</span>}
                                                        {(job.location || qf.location) && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>{job.location || qf.location}</span>}
                                                        {(job.salary || qf.salary) && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>{job.salary || qf.salary}</span>}
                                                    </div>
                                                </div>
                                                <span className="text-xs text-gray-500">{jobExpanded ? 'Ocultar Detalle' : 'Ver Detalle'}</span>
                                            </button>

                                            {jobExpanded && (
                                                <div style={{ borderTop: '1px solid var(--border)' }}>
                                                    {hasEmptyData ? (
                                                        <div className="p-4 rounded-lg bg-orange-900/20 border border-orange-500/30 flex flex-col items-center justify-center text-center space-y-2 m-4">
                                                            <span className="text-2xl">⚠️</span>
                                                            <span className="font-bold text-orange-400">No se pudo extraer información detallada de esta oferta.</span>
                                                            <span className="text-xs text-orange-300/80">Puedes revisar la oferta directamente en el BotStream o rechazarla para continuar con la siguiente.</span>
                                                        </div>
                                                    ) : (
                                                        <div className="review-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 30%) 1fr', gap: '0', minHeight: '380px' }}>
                                                            {/* ZONA IZQUIERDA — Datos rapidos */}
                                                            <div className="px-4 py-3" style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                                                                <div className="text-xs font-bold mb-3" style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Datos rápidos</div>
                                                                <div className="space-y-2">
                                                                    {[
                                                                        { icon: '\uD83D\uDCB0', label: 'Salario', value: qf.salary || aiQf.salario },
                                                                        { icon: '\uD83D\uDCC4', label: 'Contrato', value: qf.contract || aiQf.contrato },
                                                                        { icon: '\uD83D\uDD50', label: 'Jornada', value: qf.schedule || aiQf.jornada },
                                                                        { icon: '\uD83D\uDCCD', label: 'Ubicacion', value: qf.location || job.location || aiQf.ubicacion },
                                                                        { icon: '\uD83C\uDF93', label: 'Educacion', value: qf.education || aiQf.educacion },
                                                                        { icon: '\u231B', label: 'Experiencia', value: qf.experience || aiQf.experiencia },
                                                                        { icon: '\uD83C\uDFE2', label: 'Modalidad', value: qf.modality || aiQf.modalidad },
                                                                        { icon: '\uD83D\uDCC5', label: 'Publicacion', value: qf.date || aiQf.fecha },
                                                                    ].filter(item => item.value).map((item, idx) => (
                                                                        <div key={idx} className="flex items-start gap-2 p-2 rounded-lg shadow-sm" style={{ background: 'var(--bg-card)' }}>
                                                                            <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                                                                            <div className="min-w-0">
                                                                                <div className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</div>
                                                                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{item.value}</div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                    {![qf.salary, qf.contract, qf.schedule, qf.location, job.location, qf.education, qf.experience, qf.modality, qf.date, aiQf.salario, aiQf.contrato, aiQf.jornada, aiQf.ubicacion, aiQf.educacion, aiQf.experiencia, aiQf.modalidad, aiQf.fecha].some(Boolean) && (
                                                                        <div className="text-xs italic p-2" style={{ color: 'var(--text-muted)' }}>Sin datos rápidos disponibles.</div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* ZONA DERECHA — Toggle + Acordeon */}
                                                            <div className="flex flex-col overflow-hidden">
                                                                <div className="flex gap-0 px-4 pt-3 pb-2">
                                                                    {['original', 'ai'].map(mode => (
                                                                        <button key={mode} onClick={() => setViewMode(mode)}
                                                                            className="px-5 py-2 text-xs font-bold transition-all rounded-t-lg"
                                                                            style={{
                                                                                background: viewMode === mode ? (mode === 'original' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)') : 'transparent',
                                                                                color: viewMode === mode ? (mode === 'original' ? 'var(--accent)' : 'var(--accent-purple)') : 'var(--text-muted)',
                                                                                borderBottom: `2px solid ${viewMode === mode ? (mode === 'original' ? 'var(--accent)' : 'var(--accent-purple)') : 'transparent'}`,
                                                                            }}>
                                                                            {mode === 'original' ? 'Texto Original' : 'Resumen IA'}
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 custom-scrollbar" style={{ maxHeight: '420px' }}>
                                                                    {(() => {
                                                                        const sec = viewMode === 'original' ? origSections : aiSections;
                                                                        const sectionDefs = [
                                                                            { key: 'description', label: 'Descripcion del cargo' },
                                                                            { key: 'requirements', label: 'Perfil requerido / Requisitos' },
                                                                            { key: 'responsibilities', label: 'Responsabilidades principales' },
                                                                            { key: 'benefits', label: 'Compensacion y beneficios' },
                                                                            { key: 'keywords', label: 'Palabras clave' },
                                                                        ];
                                                                        const rendered = sectionDefs.filter(sd => sec[sd.key]);
                                                                        if (rendered.length === 0) {
                                                                            return (
                                                                                <div className="text-sm italic p-4" style={{ color: 'var(--text-muted)' }}>
                                                                                    {viewMode === 'original' ? (job.description || 'Sin contenido disponible.') : (typeof job.ai_summary === 'string' ? job.ai_summary : 'Sin resumen IA disponible.')}
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return rendered.map(({ key, label }) => {
                                                                            const isOpen = openSections.has(key);
                                                                            return (
                                                                                <div key={key} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                                                                    <button onClick={() => setOpenSections(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; })}
                                                                                        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:opacity-90 transition"
                                                                                        style={{ background: isOpen ? 'var(--bg-hover)' : 'var(--bg-card)' }}>
                                                                                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
                                                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                                                                            style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                                                                                            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                                                                                        </svg>
                                                                                    </button>
                                                                                    {isOpen && (
                                                                                        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap custom-scrollbar" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', maxHeight: '300px', overflowY: 'auto', wordBreak: 'break-word' }}>
                                                                                            {sec[key]}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        });
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Answers Form */}
                                {currentReview.questions && currentReview.questions.length > 0 ? (
                                    <div className="rounded-xl p-5 space-y-4" style={card}>
                                        <h3 className="font-bold mb-3 border-b border-gray-700 pb-2">Respuestas Sugeridas ({currentReview.questions.length})</h3>
                                        {currentReview.questions.map((qObj, i) => {
                                            const qText = qObj.text;
                                            const qType = qObj.type || 'text';
                                            const qOptions = qObj.options || [];
                                            const ansData = currentReview.answers[qText] || {};
                                            const aiAns = editedAnswers[qText] !== undefined ? editedAnswers[qText] : ansData.answer || '';
                                            const justification = ansData.justification;

                                            return (
                                                <div key={i} className="mb-4">
                                                    <label className="block text-sm font-semibold mb-2 text-gray-300">
                                                        {i + 1}. {qText} {qType === 'radio' && <span className="text-xs text-blue-400 ml-2">(Selección única)</span>}
                                                    </label>

                                                    {qType === 'radio' && qOptions.length > 0 ? (
                                                        <div className="flex flex-col gap-2">
                                                            {qOptions.map((opt, optIdx) => (
                                                                <label key={optIdx} className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-white/5 border border-transparent hover:border-white/10 transition">
                                                                    <input
                                                                        type="radio"
                                                                        name={`q_${i}`}
                                                                        value={opt}
                                                                        checked={aiAns === opt}
                                                                        onChange={e => updateAnswer(qText, e.target.value)}
                                                                        className="mt-1"
                                                                    />
                                                                    <span className="text-sm text-gray-200">{opt}</span>
                                                                </label>
                                                            ))}
                                                            {justification && (
                                                                <div className="mt-2 p-3 rounded bg-blue-900/20 border border-blue-800/30">
                                                                    <div className="text-xs text-blue-400 mb-1 font-semibold flex items-center gap-1">
                                                                        <span>🤖</span> Razón de la IA:
                                                                    </div>
                                                                    <div className="text-xs text-gray-400 italic leading-relaxed">{justification}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <input type="text" value={aiAns} onChange={e => updateAnswer(qText, e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : currentReview.answers && Object.keys(currentReview.answers).length > 0 ? (
                                    <div className="rounded-xl p-5 space-y-4" style={card}>
                                        <h3 className="font-bold mb-3 border-b border-gray-700 pb-2">Respuestas Sugeridas ({Object.keys(currentReview.answers).length})</h3>
                                        {Object.entries(currentReview.answers).map(([q, data], i) => (
                                            <div key={i} className="mb-4">
                                                <label className="block text-sm font-semibold mb-1 text-gray-300">{i + 1}. {q}</label>
                                                <input type="text" value={editedAnswers[q] || ''} onChange={e => updateAnswer(q, e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Sticky Log Terminal Fixed Bottom */}
            <div className="shrink-0 rounded-xl mt-2 p-1 flex flex-col shadow-inner relative" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', resize: 'vertical', overflow: 'hidden', minHeight: '80px', maxHeight: '400px', height: '140px' }}>
                <div className="flex justify-between items-center px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Terminal output</span>
                    <button onClick={clearLogs} className="text-[10px] hover:text-white transition text-gray-500">Limpiar</button>
                </div>
                <div
                    ref={logsRef}
                    onScroll={handleLogScroll}
                    className="overflow-y-auto p-2 font-mono text-[11px] leading-relaxed space-y-[2px] flex-1 custom-scrollbar"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {logs.length === 0 && <span className="italic text-gray-600">Esperando ordenes...</span>}
                    {logs.map((line, i) => (
                        <div key={i} style={{
                            color: line.includes('[ERROR]') ? 'var(--error)' :
                                line.includes('[SYSTEM]') ? 'var(--accent)' :
                                    line.includes('[WARN]') ? 'var(--warning)' :
                                        line.includes('[OK]') ? 'var(--success)' :
                                            line.includes('[REPORT]') ? 'var(--success)' : undefined
                        }}>{line}</div>
                    ))}
                </div>
            </div>
        </div>
    )
}
