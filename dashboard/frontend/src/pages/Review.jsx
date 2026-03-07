import { useState, useEffect, useRef } from 'react'
import { useBot } from '../context/BotContext'

const API = '/api'

export default function Review() {
    const { status, setStatus, reviewQueue, popReview, logs } = useBot()
    const [current, setCurrent] = useState(null)
    const [editedAnswers, setEditedAnswers] = useState({})
    const [submitting, setSubmitting] = useState(false)
    const [cvs, setCvs] = useState([])
    const [selectedCv, setSelectedCv] = useState('')
    const [missingData, setMissingData] = useState(null)
    const [missingAnswer, setMissingAnswer] = useState('')
    const [detectedQuestions, setDetectedQuestions] = useState(null)
    const [timeLeft, setTimeLeft] = useState(300)
    const [jobExpanded, setJobExpanded] = useState(true)
    const [viewMode, setViewMode] = useState('original')  // 'original' | 'ai'
    const [openSections, setOpenSections] = useState(new Set(['description']))
    const miniLogRef = useRef(null)

    // Countdown Timer for Missing Data
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

    useEffect(() => {
        fetch(`${API}/config/cvs`).then(r => r.json()).then(d => setCvs(d.cvs || [])).catch(() => { })
    }, [])

    // Pick up review requests from shared queue (any mode)
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
            // review_request arrived -- clear detected questions
            setDetectedQuestions(null)
            setCurrent(latest)
            initEditableAnswers(latest.answers)
        }
    }, [reviewQueue])

    // Also check status for pending review (fallback)
    useEffect(() => {
        if (!current && status.pending_confirmation?.type === 'review_request') {
            const data = status.pending_confirmation.data
            setCurrent(data)
            initEditableAnswers(data?.answers)
        }
    }, [status.pending_confirmation, current])

    // Auto-scroll mini log
    useEffect(() => {
        if (miniLogRef.current) miniLogRef.current.scrollTop = miniLogRef.current.scrollHeight
    }, [logs])

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
        setCurrent(null)
        setEditedAnswers({})
    }

    const handleApprove = async () => {
        setSubmitting(true)
        try {
            await fetch(`${API}/bot/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approved: true, edited_answers: editedAnswers, cv: selectedCv || null }),
            })
        } catch (err) { console.error(err) }
        setSubmitting(false)
        loadNext()
    }

    const handleReject = async () => {
        setSubmitting(true)
        try {
            await fetch(`${API}/bot/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approved: false }),
            })
        } catch (err) { console.error(err) }
        setSubmitting(false)
        loadNext()
    }

    const sendMissingData = async () => {
        if (!missingAnswer.trim()) return
        try {
            await fetch(`${API}/bot/respond_missing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answer: missingAnswer }),
            })
            setMissingData(null)
            setMissingAnswer('')
        } catch (err) { console.error(err) }
    }

    const stopBot = async () => {
        await fetch(`${API}/bot/stop`, { method: 'POST' })
        fetch(`${API}/bot/status`).then(r => r.json()).then(setStatus).catch(() => { })
    }

    const updateAnswer = (question, value) => {
        setEditedAnswers(prev => ({ ...prev, [question]: value }))
    }

    const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
    const input = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
    const isRunning = status.status === 'running' || status.status === 'paused' || status.status === 'paused_user'
    const isSemiAuto = status.mode === 'semi-auto'

    // Missing data prompt overlay
    if (missingData) {
        const isTimeUp = timeLeft === 0;
        const progressPercent = (timeLeft / 300) * 100;
        const isUrgent = timeLeft < 60;
        const progressColor = isUrgent ? 'var(--error)' : 'var(--accent)';

        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold">Dato Faltante</h1>
                <div className="rounded-xl p-6 space-y-4" style={{ ...card, borderColor: isTimeUp ? 'var(--error)' : 'var(--warning)', transition: 'border-color 0.3s' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${isTimeUp ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
                            <span className="text-sm font-bold" style={{ color: isTimeUp ? 'var(--error)' : 'var(--warning)' }}>
                                {isTimeUp ? 'Tiempo agotado' : 'El bot necesita informacion'}
                            </span>
                        </div>

                        {/* Countdown Timer */}
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-bold font-mono" style={{ color: isUrgent ? 'var(--error)' : 'var(--text-primary)' }}>
                                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')} restantes
                            </span>
                            <div className="w-32 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                                <div className="h-full transition-all duration-1000 ease-linear"
                                    style={{ width: `${progressPercent}%`, backgroundColor: progressColor }} />
                            </div>
                        </div>
                    </div>

                    <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                        <p><strong>Oferta:</strong> {missingData.job_title} | {missingData.company}</p>
                        <p><strong>Pregunta:</strong> {missingData.question}</p>
                        {missingData.current_answer && (
                            <p><strong>Respuesta IA:</strong> <span style={{ color: 'var(--error)' }}>{missingData.current_answer}</span></p>
                        )}
                        <p><strong>Confianza:</strong> {missingData.confianza}</p>
                    </div>

                    <div className="space-y-3 pt-2">
                        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Tu respuesta:</label>

                        {/* Dynamic Input Rendering */}
                        {isTimeUp ? (
                            <div className="p-4 rounded-lg text-sm text-center" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}>
                                El tiempo de espera término. El bot continuó u omitió la pregunta automáticamente.
                            </div>
                        ) : (
                            <>
                                {(missingData.input_type === 'radio' || missingData.input_type === 'select') && missingData.options && missingData.options.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {missingData.options.map((opt, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setMissingAnswer(opt)}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${missingAnswer === opt ? 'shadow-md scale-105' : 'hover:bg-opacity-80'}`}
                                                style={{
                                                    background: missingAnswer === opt ? 'var(--accent)' : 'var(--bg-hover)',
                                                    color: missingAnswer === opt ? '#fff' : 'var(--text-primary)',
                                                    border: `1px solid ${missingAnswer === opt ? 'var(--accent)' : 'var(--border)'}`
                                                }}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                ) : missingData.input_type === 'number' ? (
                                    <input type="number" value={missingAnswer} onChange={e => setMissingAnswer(e.target.value)}
                                        placeholder="Escribe el número aquí..."
                                        onKeyDown={e => e.key === 'Enter' && sendMissingData()}
                                        className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2"
                                        style={{ ...input, '--tw-ring-color': 'var(--accent)' }}
                                        autoFocus />
                                ) : (
                                    <input type="text" value={missingAnswer} onChange={e => setMissingAnswer(e.target.value)}
                                        placeholder="Escribe la respuesta aqui..."
                                        onKeyDown={e => e.key === 'Enter' && sendMissingData()}
                                        className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2"
                                        style={{ ...input, '--tw-ring-color': 'var(--accent)' }}
                                        autoFocus />
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button onClick={sendMissingData} disabled={isTimeUp}
                            className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition ${isTimeUp ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                            style={{ background: isTimeUp ? 'var(--bg-hover)' : 'linear-gradient(to right, var(--accent), var(--accent-purple))', color: isTimeUp ? 'var(--text-muted)' : '#fff' }}>
                            Enviar Dato
                        </button>
                        <button onClick={() => { setMissingData(null); setMissingAnswer('') }} disabled={isTimeUp}
                            className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition ${isTimeUp ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                            Omitir
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Waiting state
    if (!current) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Revision</h1>
                    {isRunning && (
                        <button onClick={stopBot}
                            className="px-4 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90"
                            style={{ background: 'var(--error)', color: '#fff' }}>
                            Detener Bot
                        </button>
                    )}
                </div>
                <div className="rounded-xl p-12 text-center space-y-4" style={card}>
                    {isRunning ? (
                        <>
                            <div className="w-12 h-12 mx-auto rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>
                                {detectedQuestions
                                    ? `Preguntando a la IA sobre ${detectedQuestions.questions?.length || 0} preguntas...`
                                    : isSemiAuto ? 'Esperando siguiente oferta para revision...' : 'Bot activo. Las ofertas apareceran aqui conforme se procesen.'}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Modo: <strong>{status.mode || 'apply'}</strong> | Aplicaciones: {status.apps_this_session || 0}
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
                                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
                                    <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Revision de Ofertas</p>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Inicia el bot desde el Panel de Control. En cualquier modo, las ofertas procesadas apareceran aqui.
                            </p>
                        </>
                    )}
                </div>

                {/* Detected questions panel (shows before AI responds) */}
                {detectedQuestions && detectedQuestions.questions && (
                    <div className="rounded-xl overflow-hidden" style={card}>
                        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                Preguntas detectadas ({detectedQuestions.questions.length})
                            </span>
                            {detectedQuestions.job_title && (
                                <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                                    {detectedQuestions.job_title} - {detectedQuestions.company}
                                </span>
                            )}
                        </div>
                        <div className="p-4 space-y-2">
                            {detectedQuestions.questions.map((q, i) => {
                                const typeColors = {
                                    text: { bg: 'rgba(59,130,246,0.15)', color: 'var(--accent)' },
                                    radio: { bg: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple)' },
                                    select: { bg: 'rgba(16,185,129,0.15)', color: 'var(--success)' },
                                    checkbox: { bg: 'rgba(245,158,11,0.15)', color: 'var(--warning)' },
                                }
                                const tc = typeColors[q.type] || typeColors.text
                                return (
                                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                            {i + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{q.text}</span>
                                            {q.options && q.options.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {q.options.map((opt, j) => (
                                                        <span key={j} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: tc.bg, color: tc.color }}>{opt}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0" style={{ background: tc.bg, color: tc.color }}>
                                            {q.type}
                                        </span>
                                    </div>
                                )
                            })}
                            <div className="flex items-center gap-2 pt-2 mt-2 px-2" style={{ color: 'var(--accent)' }}>
                                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                <span className="text-sm font-semibold animate-pulse">Procesando respuestas con IA...</span>
                            </div>
                        </div>
                    </div>
                )}

                {isRunning && (
                    <div className="rounded-xl overflow-hidden" style={card}>
                        <div className="px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                            Actividad del bot
                        </div>
                        <div ref={miniLogRef} className="h-36 overflow-y-auto p-3 font-mono text-xs space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                            {logs.slice(-30).map((line, i) => (
                                <div key={i} style={{
                                    color: line.includes('[OK]') ? 'var(--success)' :
                                        line.includes('[WARN]') ? 'var(--warning)' :
                                            line.includes('[ERROR]') ? 'var(--error)' :
                                                line.includes('[SYSTEM]') ? 'var(--accent)' : undefined,
                                }}>{line}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    const job = current.job || {}
    const answers = current.answers || {}
    const answerCount = Object.keys(answers).length

    // Normalize quick facts and sections for the two-zone layout
    const qf = job.quick_facts || {}
    const aiSummary = (typeof job.ai_summary === 'object' && job.ai_summary !== null) ? job.ai_summary : {}
    const aiQf = aiSummary  // AI summary quick fields (salario, contrato, etc.)

    // Original sections from browser extraction
    const origSections = job.sections || {}
    // AI sections from summarize_job structured response
    const aiSections = {
        description: aiSummary.description || '',
        requirements: aiSummary.requirements || '',
        responsibilities: aiSummary.responsibilities || '',
        benefits: aiSummary.benefits || '',
        keywords: aiSummary.keywords || '',
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Revision</h1>
                <div className="flex items-center gap-3">
                    {reviewQueue.length > 1 && (
                        <span className="px-3 py-1 text-xs font-bold rounded-full" style={{ background: 'rgba(59,130,246,0.2)', color: 'var(--accent)' }}>
                            {reviewQueue.length} pendientes
                        </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                        {status.mode || 'apply'}
                    </span>
                    {isRunning && (
                        <>
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                            <button onClick={async () => {
                                const endpoint = status.status === 'paused_user' ? '/api/bot/resume' : '/api/bot/pause'
                                await fetch(endpoint, { method: 'POST' })
                                const s = await fetch('/api/bot/status').then(r => r.json())
                                setStatus(s)
                            }}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:opacity-90"
                                style={{ background: status.status === 'paused_user' ? 'var(--success)' : 'var(--warning)', color: '#fff' }}>
                                {status.status === 'paused_user' ? 'Reanudar' : 'Pausar'}
                            </button>
                            <button onClick={stopBot}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:opacity-90"
                                style={{ background: 'var(--error)', color: '#fff' }}>
                                Detener
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Job detail — Two-zone layout */}
            <div className="rounded-xl overflow-hidden" style={card}>
                <button onClick={() => setJobExpanded(!jobExpanded)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:opacity-90 transition"
                    style={{ background: 'var(--bg-card)' }}>
                    <div>
                        <h2 className="font-bold text-lg" style={{ color: 'var(--accent)' }}>{job.title || 'Sin titulo'}</h2>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {job.company && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple)' }}>{job.company}</span>}
                            {(job.location || qf.location) && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>{job.location || qf.location}</span>}
                            {(job.salary || qf.salary) && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>{job.salary || qf.salary}</span>}
                        </div>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ color: 'var(--text-muted)', transform: jobExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                {jobExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-5 pt-3 pb-1">
                            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Detalle de la oferta</span>
                            {job.url && (
                                <a href={job.url} target="_blank" rel="noopener noreferrer"
                                    className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                                    Ver oferta en web &#8599;
                                </a>
                            )}
                        </div>

                        {/* Two-zone layout: quick facts (left) + accordion (right) */}
                        <div className="review-detail-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(220px, 30%) 1fr',
                            gap: '0',
                            minHeight: '380px',
                        }}>
                            {/* === ZONA IZQUIERDA — Datos rapidos === */}
                            <div className="px-4 py-3" style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                                <div className="text-xs font-bold mb-3" style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Datos rapidos
                                </div>
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
                                        <div key={idx} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-card)' }}>
                                            <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                                            <div className="min-w-0">
                                                <div className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</div>
                                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{item.value}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {/* Fallback si no hay datos */}
                                    {![qf.salary, qf.contract, qf.schedule, qf.location, job.location, qf.education, qf.experience, qf.modality, qf.date,
                                    aiQf.salario, aiQf.contrato, aiQf.jornada, aiQf.ubicacion, aiQf.educacion, aiQf.experiencia, aiQf.modalidad, aiQf.fecha
                                    ].some(Boolean) && (
                                            <div className="text-xs italic p-2" style={{ color: 'var(--text-muted)' }}>Sin datos rapidos disponibles.</div>
                                        )}
                                </div>
                            </div>

                            {/* === ZONA DERECHA — Toggle + Acordeon === */}
                            <div className="flex flex-col overflow-hidden">
                                {/* Toggle: Texto Original / Resumen IA */}
                                <div className="flex gap-0 px-4 pt-3 pb-2">
                                    {['original', 'ai'].map(mode => (
                                        <button key={mode} onClick={() => setViewMode(mode)}
                                            className="px-5 py-2 text-xs font-bold transition-all rounded-t-lg"
                                            style={{
                                                background: viewMode === mode
                                                    ? (mode === 'original' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)')
                                                    : 'transparent',
                                                color: viewMode === mode
                                                    ? (mode === 'original' ? 'var(--accent)' : 'var(--accent-purple)')
                                                    : 'var(--text-muted)',
                                                borderBottom: viewMode === mode
                                                    ? `2px solid ${mode === 'original' ? 'var(--accent)' : 'var(--accent-purple)'}`
                                                    : '2px solid transparent',
                                            }}>
                                            {mode === 'original' ? 'Texto Original' : 'Resumen IA'}
                                        </button>
                                    ))}
                                </div>

                                {/* Accordion sections */}
                                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1" style={{ maxHeight: '420px' }}>
                                    {(() => {
                                        const sec = viewMode === 'original' ? origSections : aiSections
                                        const sectionDefs = [
                                            { key: 'description', label: 'Descripcion del cargo' },
                                            { key: 'requirements', label: 'Perfil requerido / Requisitos' },
                                            { key: 'responsibilities', label: 'Responsabilidades principales' },
                                            { key: 'benefits', label: 'Compensacion y beneficios' },
                                            { key: 'keywords', label: 'Palabras clave' },
                                        ]
                                        const rendered = sectionDefs.filter(sd => sec[sd.key])
                                        if (rendered.length === 0) {
                                            return (
                                                <div className="text-sm italic p-4" style={{ color: 'var(--text-muted)' }}>
                                                    {viewMode === 'original'
                                                        ? (job.description || 'Sin contenido disponible.')
                                                        : (typeof job.ai_summary === 'string' ? job.ai_summary : 'Sin resumen IA disponible.')}
                                                </div>
                                            )
                                        }
                                        return rendered.map(({ key, label }) => {
                                            const isOpen = openSections.has(key)
                                            return (
                                                <div key={key} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                                    <button onClick={() => {
                                                        setOpenSections(prev => {
                                                            const next = new Set(prev)
                                                            next.has(key) ? next.delete(key) : next.add(key)
                                                            return next
                                                        })
                                                    }}
                                                        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:opacity-90 transition"
                                                        style={{ background: isOpen ? 'var(--bg-hover)' : 'var(--bg-card)' }}>
                                                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                                            style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                                                            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    </button>
                                                    {isOpen && (
                                                        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                                                            style={{
                                                                color: 'var(--text-secondary)',
                                                                borderTop: '1px solid var(--border)',
                                                                maxHeight: '300px',
                                                                overflowY: 'auto',
                                                                wordBreak: 'break-word',
                                                            }}>
                                                            {sec[key]}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Editable answers - full width for bigger fields */}
            <div className="rounded-xl p-5 space-y-4" style={card}>
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg">Respuestas de la IA</h2>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {answerCount} {answerCount === 1 ? 'pregunta' : 'preguntas'}
                    </span>
                </div>

                {answerCount === 0 && (
                    <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>Sin preguntas detectadas.</p>
                )}
                {Object.entries(answers).map(([question, data], i) => {
                    const meta = typeof data === 'object' ? data : {}
                    const confidence = meta.confianza || 'media'
                    const confColor = { alta: 'var(--success)', media: 'var(--warning)', baja: 'var(--error)' }[confidence] || 'var(--text-muted)'
                    const isMissing = meta.tipo === 'dato_faltante' || (meta.answer || '').includes('DATO_FALTANTE')
                    return (
                        <div key={i} className="space-y-2 rounded-lg p-4" style={{
                            background: 'var(--bg-primary)',
                            border: isMissing ? '2px solid var(--error)' : '1px solid var(--border)'
                        }}>
                            <div className="flex items-start gap-2">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                    {i + 1}
                                </span>
                                <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                                    {question}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0"
                                    style={{ backgroundColor: confColor + '22', color: confColor }}>
                                    {confidence}
                                </span>
                            </div>
                            {isMissing && (
                                <div className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)' }}>
                                    Dato faltante -- edita la respuesta antes de enviar
                                </div>
                            )}
                            {(() => {
                                const qInfo = (current.questions || []).find(q =>
                                    question.startsWith(q.text) || q.text.startsWith(question)
                                )
                                const type = qInfo ? qInfo.type : 'text'
                                const options = qInfo ? qInfo.options : []

                                if (type === 'radio') {
                                    return (
                                        <div className="flex flex-col gap-2 mt-2">
                                            {options.map((opt, idx) => (
                                                <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition" style={{ hover: 'background: var(--bg-hover)' }}>
                                                    <input type="radio" name={`q_${i}`} value={opt}
                                                        checked={editedAnswers[question] === opt}
                                                        onChange={e => updateAnswer(question, e.target.value)}
                                                        className="w-4 h-4 accent-blue-500" />
                                                    <span style={{ color: 'var(--text-primary)' }}>{opt}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )
                                }
                                if (type === 'select') {
                                    return (
                                        <select value={editedAnswers[question] || ''} onChange={e => updateAnswer(question, e.target.value)}
                                            className="w-full rounded-lg px-4 py-3 text-sm mt-2" style={input}>
                                            <option value="">Selecciona una opcion...</option>
                                            {options.map((opt, idx) => (
                                                <option key={idx} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    )
                                }
                                if (type === 'checkbox') {
                                    const selectedVals = (editedAnswers[question] || '').split(',').map(v => v.trim()).filter(v => v)
                                    return (
                                        <div className="flex flex-col gap-2 mt-2">
                                            {options.map((opt, idx) => {
                                                const isChecked = selectedVals.includes(opt)
                                                return (
                                                    <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition" style={{ hover: 'background: var(--bg-hover)' }}>
                                                        <input type="checkbox" value={opt}
                                                            checked={isChecked}
                                                            onChange={e => {
                                                                if (e.target.checked) {
                                                                    updateAnswer(question, [...selectedVals, opt].join(', '))
                                                                } else {
                                                                    updateAnswer(question, selectedVals.filter(v => v !== opt).join(', '))
                                                                }
                                                            }}
                                                            className="w-4 h-4 rounded accent-blue-500" />
                                                        <span style={{ color: 'var(--text-primary)' }}>{opt}</span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    )
                                }
                                return (
                                    <textarea
                                        value={editedAnswers[question] || ''}
                                        onChange={e => updateAnswer(question, e.target.value)}
                                        rows={Math.max(4, Math.ceil((editedAnswers[question] || '').length / 80))}
                                        className="w-full rounded-lg px-4 py-3 text-sm resize-y leading-relaxed mt-2"
                                        style={{ ...input, minHeight: '100px' }}
                                        placeholder="Escribe o edita la respuesta aqui..."
                                    />
                                )
                            })()}
                            <div className="flex items-center justify-between">
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    Tipo: {meta.tipo || '-'} | Modelo: {meta.model || meta.modelo || '-'}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* CV selector + Action buttons */}
            {isSemiAuto ? (
                <div className="rounded-xl p-4 space-y-3" style={card}>
                    {/* Summary of what will be sent */}
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <strong>{job.title}</strong> en <strong>{job.company || '?'}</strong> | {answerCount} respuestas
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="flex items-center gap-2 flex-1">
                            <label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>CV:</label>
                            <select value={selectedCv} onChange={e => setSelectedCv(e.target.value)}
                                className="rounded-lg px-3 py-2 text-sm flex-1" style={input}>
                                <option value="">Default (automatico)</option>
                                {cvs.map(c => <option key={c.filename} value={c.filename}>{c.filename} ({c.size_kb} KB)</option>)}
                            </select>
                        </div>
                        <div className="flex gap-3 justify-end shrink-0">
                            <button onClick={handleReject} disabled={submitting}
                                className="px-6 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50 hover:opacity-90"
                                style={{ background: 'var(--error)', color: '#fff' }}>
                                Rechazar
                            </button>
                            <button onClick={handleApprove} disabled={submitting}
                                className="px-6 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50 hover:opacity-90"
                                style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-purple))', color: '#fff' }}>
                                {submitting ? 'Enviando...' : 'Enviar Aplicacion'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--text-secondary)' }}>
                    Modo <strong>{status.mode || 'apply'}</strong> -- Vista de solo lectura. Cambia a <strong>Semi-Auto</strong> para editar respuestas antes de enviar.
                </div>
            )}
        </div>
    )
}
