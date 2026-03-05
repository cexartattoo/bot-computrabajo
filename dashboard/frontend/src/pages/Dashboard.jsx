import { useState, useEffect, useRef } from 'react'

const API = '/api'
const STATUS_COLORS = {
    idle: 'bg-slate-600', running: 'bg-green-500 animate-pulse',
    paused: 'bg-yellow-500 animate-pulse', error: 'bg-red-500',
    stopping: 'bg-orange-500 animate-pulse',
    disconnected: 'bg-orange-500 animate-pulse',
}
const STATUS_LABELS = {
    idle: 'Inactivo', running: 'Corriendo',
    paused: 'Esperando confirmacion', error: 'Error',
    stopping: 'Deteniendo...',
    disconnected: 'Conectando con API...',
}

function formatElapsed(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
}

export default function Dashboard() {
    const [status, setStatus] = useState({ status: 'disconnected', mode: 'apply', apps_this_session: 0, log_tail: [] })
    const [mode, setMode] = useState('dry-run-llm')
    const [maxApps, setMaxApps] = useState(5)
    const [keyword, setKeyword] = useState('')
    const [cv, setCv] = useState('')
    const [cvs, setCvs] = useState([])
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(false)
    const [elapsed, setElapsed] = useState(0)
    const [reportUrl, setReportUrl] = useState(null)
    const logsRef = useRef(null)
    const wsRef = useRef(null)

    // Fetch status with auto-retry
    useEffect(() => {
        const fetchStatus = () => {
            fetch(`${API}/bot/status`)
                .then(r => r.json())
                .then(d => setStatus(d))
                .catch(() => setStatus(prev => ({ ...prev, status: 'disconnected' })))
        }
        fetchStatus()
        const interval = setInterval(fetchStatus, 5000)
        fetch(`${API}/config/cvs`).then(r => r.json()).then(d => setCvs(d.cvs || [])).catch(() => { })
        return () => clearInterval(interval)
    }, [])

    // Elapsed time timer
    useEffect(() => {
        if (status.status === 'running') {
            const timer = setInterval(() => setElapsed(prev => prev + 1), 1000)
            return () => clearInterval(timer)
        } else if (status.status === 'idle' || status.status === 'error' || status.status === 'disconnected') {
            setElapsed(0)
        }
    }, [status.status])

    // WebSocket for live logs with auto-reconnect
    useEffect(() => {
        let ws
        let reconnectTimer
        const connect = () => {
            const proto = location.protocol === 'https:' ? 'wss' : 'ws'
            ws = new WebSocket(`${proto}://${location.host}/api/bot/ws`)
            ws.onmessage = (e) => {
                setLogs(prev => {
                    const next = [...prev, e.data]
                    return next.length > 500 ? next.slice(-500) : next
                })
                if (e.data.includes('[SYSTEM]')) {
                    fetch(`${API}/bot/status`).then(r => r.json()).then(setStatus).catch(() => { })
                }
                // Detect report generated
                if (e.data.includes('[REPORT]') || e.data.includes('Informe generado')) {
                    const match = e.data.match(/informe_[\w]+\.html/)
                    if (match) {
                        setReportUrl(`${API}/reports/${match[0]}`)
                    }
                }
            }
            ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000) }
            ws.onerror = () => { ws.close() }
            wsRef.current = ws
        }
        connect()
        return () => { clearTimeout(reconnectTimer); ws?.close() }
    }, [])

    // Auto-scroll logs
    useEffect(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
    }, [logs])

    const startBot = async () => {
        setLoading(true)
        setReportUrl(null)
        setElapsed(0)
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

    const confirm = async (approved) => {
        await fetch(`${API}/bot/confirm`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved }),
        })
        fetch(`${API}/bot/status`).then(r => r.json()).then(setStatus)
    }

    const isRunning = status.status === 'running' || status.status === 'paused'

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Panel de Control</h1>

            {/* Status badge + elapsed timer */}
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[status.status] || 'bg-gray-500'}`} />
                <span className="text-lg font-semibold">{STATUS_LABELS[status.status] || status.status}</span>
                {isRunning && (
                    <>
                        <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 text-xs font-mono rounded">
                            {formatElapsed(elapsed)} transcurrido
                        </span>
                        <span className="ml-auto text-sm text-slate-400">
                            {status.apps_this_session} aplicaciones esta sesion
                        </span>
                    </>
                )}
            </div>

            {/* Controls */}
            <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="text-xs text-slate-400 font-medium mb-1 block">Modo</label>
                        <select value={mode} onChange={e => setMode(e.target.value)}
                            className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm">
                            <option value="apply">Aplicar</option>
                            <option value="dry-run-llm">Dry-Run LLM</option>
                            <option value="semi-auto">Semi-Auto</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 font-medium mb-1 block">Max. aplicaciones</label>
                        <input type="number" value={maxApps} onChange={e => setMaxApps(Number(e.target.value))}
                            className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm" min={1} />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 font-medium mb-1 block">Keyword</label>
                        <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
                            placeholder="ej: ingeniero" className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 font-medium mb-1 block">CV</label>
                        <select value={cv} onChange={e => setCv(e.target.value)}
                            className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm">
                            <option value="">Auto (default)</option>
                            {cvs.map(c => <option key={c.filename} value={c.filename}>{c.filename}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex gap-3 pt-2">
                    {!isRunning ? (
                        <button onClick={startBot} disabled={loading}
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-semibold text-sm hover:opacity-90 transition disabled:opacity-50">
                            Iniciar Bot
                        </button>
                    ) : (
                        <button onClick={stopBot} disabled={loading}
                            className="px-6 py-2.5 bg-red-600 rounded-lg font-semibold text-sm hover:bg-red-700 transition disabled:opacity-50">
                            Detener
                        </button>
                    )}
                </div>
            </div>

            {/* Report link */}
            {reportUrl && (
                <div className="bg-green-900/20 border border-green-600 rounded-xl p-4 flex items-center gap-3">
                    <span className="text-green-400 font-semibold text-sm">Informe generado</span>
                    <a href={reportUrl} target="_blank" rel="noopener noreferrer"
                        className="px-4 py-1.5 bg-green-600 rounded-lg text-sm font-semibold hover:bg-green-700 transition">
                        Abrir Informe
                    </a>
                </div>
            )}

            {/* Semi-auto confirmation */}
            {status.pending_confirmation && (
                <div className="bg-yellow-900/30 border border-yellow-600 rounded-xl p-5 space-y-3">
                    <h3 className="text-yellow-400 font-bold">Confirmacion requerida</h3>
                    <p className="text-sm text-slate-300">{status.pending_confirmation.line}</p>
                    <div className="flex gap-3">
                        <button onClick={() => confirm(true)}
                            className="px-5 py-2 bg-green-600 rounded-lg text-sm font-semibold hover:bg-green-700">
                            Aprobar
                        </button>
                        <button onClick={() => confirm(false)}
                            className="px-5 py-2 bg-red-600 rounded-lg text-sm font-semibold hover:bg-red-700">
                            Rechazar
                        </button>
                    </div>
                </div>
            )}

            {/* Live logs */}
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-[#1e293b] border-b border-[#334155]">
                    <span className="text-xs font-semibold text-slate-400">Logs en vivo</span>
                    <button onClick={() => setLogs([])} className="text-xs text-slate-500 hover:text-slate-300">Limpiar</button>
                </div>
                <div ref={logsRef} className="h-72 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-slate-300 space-y-0.5">
                    {logs.length === 0 && <p className="text-slate-600 italic">Sin logs aun. Inicia el bot para ver la actividad.</p>}
                    {logs.map((line, i) => (
                        <div key={i} className={
                            line.includes('[ERROR]') ? 'text-red-400' :
                                line.includes('[SYSTEM]') ? 'text-blue-400' :
                                    line.includes('[WARN]') ? 'text-yellow-400' :
                                        line.includes('[OK]') ? 'text-green-400' :
                                            line.includes('[REPORT]') ? 'text-emerald-400 font-semibold' : ''
                        }>{line}</div>
                    ))}
                </div>
            </div>
        </div>
    )
}
