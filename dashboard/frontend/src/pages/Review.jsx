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
    const [jobExpanded, setJobExpanded] = useState(true)
    const miniLogRef = useRef(null)

    useEffect(() => {
        fetch(`${API}/config/cvs`).then(r => r.json()).then(d => setCvs(d.cvs || [])).catch(() => { })
    }, [])

    // Pick up review requests from shared queue (any mode)
    useEffect(() => {
        if (reviewQueue.length > 0) {
            const latest = reviewQueue[reviewQueue.length - 1]
            if (latest.type === 'missing_data') {
                setMissingData(latest)
                return
            }
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
    const isRunning = status.status === 'running' || status.status === 'paused'
    const isSemiAuto = status.mode === 'semi-auto'

    // Missing data prompt overlay
    if (missingData) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold">Dato Faltante</h1>
                <div className="rounded-xl p-6 space-y-4" style={{ ...card, borderColor: 'var(--warning)' }}>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                        <span className="text-sm font-bold" style={{ color: 'var(--warning)' }}>El bot necesita informacion</span>
                    </div>
                    <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                        <p><strong>Oferta:</strong> {missingData.job_title} | {missingData.company}</p>
                        <p><strong>Pregunta:</strong> {missingData.question}</p>
                        {missingData.current_answer && (
                            <p><strong>Respuesta IA:</strong> <span style={{ color: 'var(--error)' }}>{missingData.current_answer}</span></p>
                        )}
                        <p><strong>Confianza:</strong> {missingData.confianza}</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Tu respuesta (tienes 5 min):</label>
                        <input type="text" value={missingAnswer} onChange={e => setMissingAnswer(e.target.value)}
                            placeholder="Escribe la respuesta aqui..."
                            onKeyDown={e => e.key === 'Enter' && sendMissingData()}
                            className="w-full rounded-lg px-4 py-3 text-sm" style={input}
                            autoFocus />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={sendMissingData}
                            className="px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition"
                            style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-purple))', color: '#fff' }}>
                            Enviar Dato
                        </button>
                        <button onClick={() => { setMissingData(null); setMissingAnswer('') }}
                            className="px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition"
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
                                {isSemiAuto ? 'Esperando siguiente oferta para revision...' : 'Bot activo. Las ofertas apareceran aqui conforme se procesen.'}
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
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                    <button onClick={stopBot}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:opacity-90"
                        style={{ background: 'var(--error)', color: '#fff' }}>
                        Detener
                    </button>
                </div>
            </div>

            {/* Job summary card */}
            <div className="rounded-xl overflow-hidden" style={card}>
                <button onClick={() => setJobExpanded(!jobExpanded)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:opacity-90 transition"
                    style={{ background: 'var(--bg-card)' }}>
                    <div>
                        <h2 className="font-bold text-lg" style={{ color: 'var(--accent)' }}>{job.title || 'Sin titulo'}</h2>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {job.company && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple)' }}>{job.company}</span>}
                            {job.location && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>{job.location}</span>}
                            {job.salary && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>{job.salary}</span>}
                        </div>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ color: 'var(--text-muted)', transform: jobExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                {jobExpanded && (
                    <div className="px-5 pb-4 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                        {job.url && (
                            <a href={job.url} target="_blank" rel="noopener noreferrer"
                                className="inline-block text-xs hover:underline mt-2" style={{ color: 'var(--accent)' }}>
                                Ver oferta original
                            </a>
                        )}
                        <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto" style={{ color: 'var(--text-secondary)' }}>
                            {job.description || 'Descripcion no disponible.'}
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
                            <textarea
                                value={editedAnswers[question] || ''}
                                onChange={e => updateAnswer(question, e.target.value)}
                                rows={Math.max(4, Math.ceil((editedAnswers[question] || '').length / 80))}
                                className="w-full rounded-lg px-4 py-3 text-sm resize-y leading-relaxed"
                                style={{ ...input, minHeight: '100px' }}
                                placeholder="Escribe o edita la respuesta aqui..."
                            />
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
