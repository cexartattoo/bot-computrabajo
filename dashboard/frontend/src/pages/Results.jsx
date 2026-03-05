import { useState, useEffect, useRef } from 'react'

const API = '/api'

const STATUS_BADGE = {
    applied: { color: 'var(--success)', label: 'Aplicado' },
    'dry-run': { color: 'var(--accent)', label: 'Dry-Run' },
    error: { color: 'var(--error)', label: 'Error' },
    skipped: { color: 'var(--text-muted)', label: 'Saltado' },
}

export default function Results() {
    const [apps, setApps] = useState([])
    const [total, setTotal] = useState(0)
    const [botStatus, setBotStatus] = useState('idle')
    const [reports, setReports] = useState([])
    const timerRef = useRef(null)

    const fetchApps = () => {
        fetch(`${API}/history?per_page=50`)
            .then(r => r.json())
            .then(d => { setApps(d.data || []); setTotal(d.total || 0) })
            .catch(() => { })
    }

    const fetchReports = () => {
        fetch(`${API}/reports`)
            .then(r => r.json())
            .then(d => setReports(d.reports || []))
            .catch(() => { })
    }

    useEffect(() => {
        fetchApps()
        fetchReports()
        const statusInterval = setInterval(() => {
            fetch(`${API}/bot/status`).then(r => r.json()).then(d => setBotStatus(d.status)).catch(() => { })
        }, 5000)
        return () => clearInterval(statusInterval)
    }, [])

    useEffect(() => {
        if (botStatus === 'running') {
            timerRef.current = setInterval(() => { fetchApps(); fetchReports() }, 10000)
            return () => clearInterval(timerRef.current)
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [botStatus])

    const formatTime = (dateStr) => {
        if (!dateStr) return ''
        const d = new Date(dateStr.replace(' ', 'T'))
        return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return ''
        const d = new Date(dateStr.replace(' ', 'T'))
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
    }

    const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Resultados</h1>
                <div className="flex items-center gap-3">
                    {botStatus === 'running' && (
                        <span className="text-xs animate-pulse" style={{ color: 'var(--success)' }}>Actualizando en vivo...</span>
                    )}
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{total} aplicaciones</span>
                    <button onClick={() => { fetchApps(); fetchReports() }}
                        className="px-3 py-1.5 rounded-lg text-xs transition" style={{ background: 'var(--bg-hover)' }}>
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Reports */}
            {reports.length > 0 && (
                <section className="rounded-xl p-4 space-y-2" style={card}>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Informes Generados</h2>
                    <div className="flex flex-wrap gap-2">
                        {reports.slice(0, 5).map(r => (
                            <a key={r.filename}
                                href={`${API}/reports/${r.filename}`}
                                target="_blank" rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition"
                                style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' }}>
                                {r.filename} ({r.size_kb} KB)
                            </a>
                        ))}
                    </div>
                </section>
            )}

            {/* Live table */}
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                <table className="w-full">
                    <thead>
                        <tr style={{ background: 'var(--bg-card)' }}>
                            <th className="px-4 py-3 text-xs font-semibold text-left" style={{ color: 'var(--text-secondary)' }}>Cargo</th>
                            <th className="px-4 py-3 text-xs font-semibold text-left" style={{ color: 'var(--text-secondary)' }}>Empresa</th>
                            <th className="px-4 py-3 text-xs font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Estado</th>
                            <th className="px-4 py-3 text-xs font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Modo</th>
                            <th className="px-4 py-3 text-xs font-semibold text-right" style={{ color: 'var(--text-secondary)' }}>Fecha</th>
                        </tr>
                    </thead>
                    <tbody>
                        {apps.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center italic" style={{ color: 'var(--text-muted)' }}>
                                Sin aplicaciones registradas aun.
                            </td></tr>
                        )}
                        {apps.map((app, i) => {
                            const badge = STATUS_BADGE[app.status] || STATUS_BADGE.error
                            return (
                                <tr key={app.id || i} className="transition" style={{ borderTop: '1px solid var(--border)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td className="px-4 py-3 text-sm">
                                        {app.url ? (
                                            <a href={app.url} target="_blank" rel="noopener noreferrer"
                                                className="hover:underline" style={{ color: 'var(--accent)' }}>{app.job_title || 'Sin titulo'}</a>
                                        ) : (
                                            <span>{app.job_title || 'Sin titulo'}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{app.company || '-'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                            style={{ backgroundColor: badge.color + '22', color: badge.color }}>
                                            {badge.label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{app.mode || 'apply'}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                                        {formatDate(app.applied_at)} {formatTime(app.applied_at)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
