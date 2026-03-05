import { useState, useEffect, useRef } from 'react'

const API = '/api'

export default function Review() {
    const [queue, setQueue] = useState([])
    const [current, setCurrent] = useState(null)
    const [editedAnswers, setEditedAnswers] = useState({})
    const [botStatus, setBotStatus] = useState('idle')
    const [submitting, setSubmitting] = useState(false)
    const wsRef = useRef(null)

    // Poll bot status
    useEffect(() => {
        const interval = setInterval(() => {
            fetch(`${API}/bot/status`)
                .then(r => r.json())
                .then(d => setBotStatus(d.status))
                .catch(() => { })
        }, 3000)
        return () => clearInterval(interval)
    }, [])

    // WebSocket for semi-auto review data
    useEffect(() => {
        let ws
        let reconnectTimer
        const connect = () => {
            const proto = location.protocol === 'https:' ? 'wss' : 'ws'
            ws = new WebSocket(`${proto}://${location.host}/api/bot/ws`)
            ws.onmessage = (e) => {
                try {
                    // Try to parse as JSON (review data)
                    if (e.data.startsWith('{') || e.data.startsWith('[')) {
                        const data = JSON.parse(e.data)
                        if (data.type === 'review_request') {
                            setQueue(prev => [...prev, data])
                            if (!current) {
                                setCurrent(data)
                                initEditableAnswers(data.answers)
                            }
                        }
                    }
                } catch {
                    // Regular log line, ignore
                }
            }
            ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000) }
            ws.onerror = () => { ws.close() }
            wsRef.current = ws
        }
        connect()
        return () => { clearTimeout(reconnectTimer); ws?.close() }
    }, [])

    const initEditableAnswers = (answers) => {
        if (!answers) return
        const editable = {}
        Object.entries(answers).forEach(([q, data]) => {
            editable[q] = typeof data === 'object' ? (data.respuesta || data.answer || '') : String(data)
        })
        setEditedAnswers(editable)
    }

    const loadNext = () => {
        setQueue(prev => {
            const next = prev.slice(1)
            if (next.length > 0) {
                setCurrent(next[0])
                initEditableAnswers(next[0].answers)
            } else {
                setCurrent(null)
                setEditedAnswers({})
            }
            return next
        })
    }

    const handleApprove = async () => {
        setSubmitting(true)
        try {
            await fetch(`${API}/bot/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    approved: true,
                    edited_answers: editedAnswers,
                }),
            })
        } catch (err) {
            console.error('Approve error:', err)
        }
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
        } catch (err) {
            console.error('Reject error:', err)
        }
        setSubmitting(false)
        loadNext()
    }

    const updateAnswer = (question, value) => {
        setEditedAnswers(prev => ({ ...prev, [question]: value }))
    }

    // Waiting state
    if (!current) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold">Revision (Semi-Auto)</h1>
                <div className="rounded-xl p-12 text-center space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    {botStatus === 'running' || botStatus === 'paused' ? (
                        <>
                            <div className="w-12 h-12 mx-auto rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                            <p style={{ color: 'var(--text-secondary)' }}>Esperando siguiente oferta para revision...</p>
                            {queue.length > 0 && (
                                <p className="text-sm text-blue-400">{queue.length} en cola</p>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center text-2xl" style={{ background: 'var(--bg-hover)' }}>?</div>
                            <p style={{ color: 'var(--text-secondary)' }}>Inicia el bot en modo <strong>Semi-Auto</strong> desde el Panel para usar esta vista.</p>
                        </>
                    )}
                </div>
            </div>
        )
    }

    const job = current.job || {}
    const answers = current.answers || {}

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Revision</h1>
                {queue.length > 1 && (
                    <span className="px-3 py-1 text-xs font-bold rounded-full" style={{ background: 'rgba(59,130,246,0.2)', color: 'var(--accent)' }}>
                        {queue.length} pendientes
                    </span>
                )}
            </div>

            {/* Split view: Offer | Answers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Job description */}
                <div className="rounded-xl p-5 space-y-3 overflow-y-auto max-h-[70vh]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <h2 className="font-bold text-lg" style={{ color: 'var(--accent)' }}>{job.title || 'Sin titulo'}</h2>
                    <div className="flex gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span>{job.company || '-'}</span>
                        <span>|</span>
                        <span>{job.location || '-'}</span>
                        {job.salary && <><span>|</span><span>{job.salary}</span></>}
                    </div>
                    {job.url && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                            Ver oferta original
                        </a>
                    )}
                    <hr style={{ borderColor: 'var(--border)' }} />
                    <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                        {job.description || 'Descripcion no disponible. El bot extraera la descripcion cuando entre al detalle de la oferta.'}
                    </div>
                </div>

                {/* Right: Editable answers */}
                <div className="rounded-xl p-5 space-y-4 overflow-y-auto max-h-[70vh]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <h2 className="font-bold text-lg">Respuestas propuestas (IA)</h2>
                    {Object.entries(answers).length === 0 && (
                        <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>Sin preguntas detectadas.</p>
                    )}
                    {Object.entries(answers).map(([question, data], i) => {
                        const meta = typeof data === 'object' ? data : {}
                        const confidence = meta.confianza || 'media'
                        const confColor = { alta: '#22c55e', media: '#f59e0b', baja: '#ef4444' }[confidence] || '#94a3b8'
                        return (
                            <div key={i} className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {i + 1}. {question}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                        style={{ backgroundColor: confColor + '22', color: confColor }}>
                                        {confidence}
                                    </span>
                                </div>
                                <textarea
                                    value={editedAnswers[question] || ''}
                                    onChange={e => updateAnswer(question, e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg px-3 py-2 text-sm resize-y"
                                    style={{
                                        background: 'var(--bg-input)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                                {meta.tipo && (
                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        Tipo: {meta.tipo} | Modelo: {meta.model || meta.modelo || '-'}
                                    </span>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 justify-end pt-2">
                <button onClick={handleReject} disabled={submitting}
                    className="px-6 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50"
                    style={{ background: 'var(--error)', color: '#fff' }}>
                    Rechazar
                </button>
                <button onClick={handleApprove} disabled={submitting}
                    className="px-6 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50"
                    style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-purple))', color: '#fff' }}>
                    Enviar Aplicacion
                </button>
            </div>
        </div>
    )
}
