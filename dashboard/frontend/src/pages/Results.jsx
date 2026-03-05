import { useState, useEffect, useRef } from 'react'

const API = '/api'

const STATUS_BADGE = {
    applied: { bg: 'bg-green-900/30', text: 'text-green-400', label: 'Aplicado' },
    'dry-run': { bg: 'bg-blue-900/30', text: 'text-blue-400', label: 'Dry-Run' },
    error: { bg: 'bg-red-900/30', text: 'text-red-400', label: 'Error' },
    skipped: { bg: 'bg-slate-700/30', text: 'text-slate-400', label: 'Saltado' },
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
            .then(d => {
                setApps(d.data || [])
                setTotal(d.total || 0)
            })
            .catch(() => { })
    }

    const fetchReports = () => {
        fetch(`${API}/reports`)
            .then(r => r.json())
            .then(d => setReports(d.reports || []))
            .catch(() => { })
    }

    // Initial fetch + poll while running
    useEffect(() => {
        fetchApps()
        fetchReports()

        // Check bot status every 5s
        const statusInterval = setInterval(() => {
            fetch(`${API}/bot/status`)
                .then(r => r.json())
                .then(d => setBotStatus(d.status))
                .catch(() => { })
        }, 5000)

        return () => clearInterval(statusInterval)
    }, [])

    // Poll history every 10s while bot is running
    useEffect(() => {
        if (botStatus === 'running') {
            timerRef.current = setInterval(() => {
                fetchApps()
                fetchReports()
            }, 10000)
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Resultados</h1>
                <div className="flex items-center gap-3">
                    {botStatus === 'running' && (
                        <span className="text-xs text-green-400 animate-pulse">Actualizando en vivo...</span>
                    )}
                    <span className="text-sm text-slate-400">{total} aplicaciones</span>
                    <button onClick={() => { fetchApps(); fetchReports() }}
                        className="px-3 py-1.5 bg-[#334155] rounded-lg text-xs hover:bg-[#475569] transition">
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Reports */}
            {reports.length > 0 && (
                <section className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 space-y-2">
                    <h2 className="text-sm font-semibold text-slate-400">Informes Generados</h2>
                    <div className="flex flex-wrap gap-2">
                        {reports.slice(0, 5).map(r => (
                            <a key={r.filename}
                                href={`${API}/reports/${r.filename}`}
                                target="_blank" rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-emerald-900/20 text-emerald-400 border border-emerald-800/30 rounded-lg text-xs font-medium hover:bg-emerald-900/40 transition">
                                {r.filename} ({r.size_kb} KB)
                            </a>
                        ))}
                    </div>
                </section>
            )}

            {/* Live table */}
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-[#1e293b] text-left">
                            <th className="px-4 py-3 text-xs font-semibold text-slate-400">Cargo</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-400">Empresa</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-400 text-center">Estado</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-400 text-center">Modo</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-400 text-right">Fecha</th>
                        </tr>
                    </thead>
                    <tbody>
                        {apps.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-600 italic">
                                Sin aplicaciones registradas aun.
                            </td></tr>
                        )}
                        {apps.map((app, i) => {
                            const badge = STATUS_BADGE[app.status] || STATUS_BADGE.error
                            return (
                                <tr key={app.id || i} className="border-t border-[#334155]/50 hover:bg-[#1e293b]/50 transition">
                                    <td className="px-4 py-3 text-sm">
                                        {app.url ? (
                                            <a href={app.url} target="_blank" rel="noopener noreferrer"
                                                className="text-blue-400 hover:underline">{app.job_title || 'Sin titulo'}</a>
                                        ) : (
                                            <span>{app.job_title || 'Sin titulo'}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{app.company || '-'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                                            {badge.label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-xs text-slate-500">{app.mode || 'apply'}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-slate-500">
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
