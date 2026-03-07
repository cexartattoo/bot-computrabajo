import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
    const { status, setStatus, logs, clearLogs, reportUrl } = useBot()
    const navigate = useNavigate()
    const [mode, setMode] = useState('dry-run-llm')
    const [maxApps, setMaxApps] = useState(5)
    const [keyword, setKeyword] = useState('')
    const [cv, setCv] = useState('')
    const [cvs, setCvs] = useState([])
    const [loading, setLoading] = useState(false)
    const [elapsed, setElapsed] = useState(0)
    const logsRef = useRef(null)

    useEffect(() => {
        fetch(`${API}/config/cvs`).then(r => r.json()).then(d => setCvs(d.cvs || [])).catch(() => { })
    }, [])

    useEffect(() => {
        if (status.status === 'running' || status.status === 'paused') {
            const timer = setInterval(() => setElapsed(prev => prev + 1), 1000)
            return () => clearInterval(timer)
        } else if (status.status === 'idle' || status.status === 'error' || status.status === 'disconnected') {
            setElapsed(0)
        }
    }, [status.status])

    useEffect(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
    }, [logs])

    const startBot = async () => {
        setLoading(true)
        setElapsed(0)
        const body = { mode, max_apps: maxApps || null, keyword: keyword || null, cv: cv || null }
        const res = await fetch(`${API}/bot/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const data = await res.json()
        setStatus(prev => ({ ...prev, ...data }))
        setLoading(false)
        // Redirect to review page in semi-auto mode
        if (mode === 'semi-auto' && !data.error) {
            navigate('/review')
        }
    }

    const stopBot = async () => {
        setLoading(true)
        const res = await fetch(`${API}/bot/stop`, { method: 'POST' })
        const data = await res.json()
        setStatus(prev => ({ ...prev, ...data }))
        setLoading(false)
    }



    const isRunning = status.status === 'running' || status.status === 'paused' || status.status === 'paused_user'

    const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
    const input = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Panel de Control</h1>

            {/* Status badge + elapsed timer */}
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[status.status] || 'bg-gray-500'}`} />
                <span className="text-lg font-semibold">{STATUS_LABELS[status.status] || status.status}</span>
                {isRunning && (
                    <>
                        <span className="px-2 py-0.5 text-xs font-mono rounded"
                            style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>
                            {formatElapsed(elapsed)} transcurrido
                        </span>
                        <span className="ml-auto text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {status.apps_this_session} aplicaciones esta sesion
                        </span>
                    </>
                )}
            </div>

            {/* Controls */}
            <div className="rounded-xl p-5 space-y-4" style={card}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Modo</label>
                        <select value={mode} onChange={e => setMode(e.target.value)}
                            className="w-full rounded-lg px-3 py-2 text-sm" style={input}>
                            <option value="apply">Aplicar</option>
                            <option value="dry-run-llm">Dry-Run LLM</option>
                            <option value="semi-auto">Semi-Auto</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Max. aplicaciones</label>
                        <input type="number" value={maxApps} onChange={e => setMaxApps(Number(e.target.value))}
                            className="w-full rounded-lg px-3 py-2 text-sm" style={input} min={1} />
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Keyword</label>
                        <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
                            placeholder="ej: ingeniero" className="w-full rounded-lg px-3 py-2 text-sm" style={input} />
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>CV</label>
                        <select value={cv} onChange={e => setCv(e.target.value)}
                            className="w-full rounded-lg px-3 py-2 text-sm" style={input}>
                            <option value="">Auto (default)</option>
                            {cvs.map(c => <option key={c.filename} value={c.filename}>{c.filename}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex gap-3 pt-2">
                    {!isRunning ? (
                        <button onClick={startBot} disabled={loading}
                            className="px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
                            style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-purple))', color: '#fff' }}>
                            Iniciar Bot
                        </button>
                    ) : (
                        <>
                            <button onClick={async () => {
                                const endpoint = status.status === 'paused_user' ? `${API}/bot/resume` : `${API}/bot/pause`
                                setLoading(true)
                                await fetch(endpoint, { method: 'POST' })
                                const s = await fetch(`${API}/bot/status`).then(r => r.json())
                                setStatus(prev => ({ ...prev, ...s }))
                                setLoading(false)
                            }} disabled={loading}
                                className="px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
                                style={{ background: status.status === 'paused_user' ? 'var(--success)' : 'var(--warning)', color: '#fff' }}>
                                {status.status === 'paused_user' ? 'Reanudar' : 'Pausar'}
                            </button>
                            <button onClick={stopBot} disabled={loading}
                                className="px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
                                style={{ background: 'var(--error)', color: '#fff' }}>
                                Detener
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Report link */}
            {reportUrl && (
                <div className="rounded-xl p-4 flex items-center gap-3"
                    style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)' }}>
                    <span className="font-semibold text-sm" style={{ color: 'var(--success)' }}>Informe generado</span>
                    <a href={reportUrl} target="_blank" rel="noopener noreferrer"
                        className="px-4 py-1.5 rounded-lg text-sm font-semibold hover:opacity-90 transition"
                        style={{ background: 'var(--success)', color: '#fff' }}>
                        Abrir Informe
                    </a>
                </div>
            )}

            {/* Pending review Banner -- redirect to Review page for full context */}
            {status.pending_confirmation && (
                <div className="rounded-xl p-5 space-y-3"
                    style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid var(--warning)' }}>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                        <h3 className="font-bold" style={{ color: 'var(--warning)' }}>Oferta pendiente de revision</h3>
                    </div>
                    {status.pending_confirmation.data?.job && (
                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <strong>{status.pending_confirmation.data.job.title}</strong> en <strong>{status.pending_confirmation.data.job.company || '?'}</strong>
                            {status.pending_confirmation.data.answers && (
                                <span> | {Object.keys(status.pending_confirmation.data.answers).length} preguntas</span>
                            )}
                        </div>
                    )}
                    <button onClick={() => navigate('/review')}
                        className="px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition"
                        style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-purple))', color: '#fff' }}>
                        Ir a Revision (ver detalles y aprobar/rechazar)
                    </button>
                </div>
            )}

            {/* Live logs */}
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between px-4 py-2" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Logs en vivo</span>
                    <button onClick={clearLogs} className="text-xs hover:opacity-80" style={{ color: 'var(--text-muted)' }}>Limpiar</button>
                </div>
                <div ref={logsRef} className="h-72 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {logs.length === 0 && <p className="italic" style={{ color: 'var(--text-muted)' }}>Sin logs aun. Inicia el bot para ver la actividad.</p>}
                    {logs.map((line, i) => (
                        <div key={i} style={{
                            color: line.includes('[ERROR]') ? 'var(--error)' :
                                line.includes('[SYSTEM]') ? 'var(--accent)' :
                                    line.includes('[WARN]') ? 'var(--warning)' :
                                        line.includes('[OK]') ? 'var(--success)' :
                                            line.includes('[REPORT]') ? 'var(--success)' : undefined,
                            fontWeight: line.includes('[REPORT]') ? 600 : undefined,
                        }}>{line}</div>
                    ))}
                </div>
            </div>
        </div>
    )
}
