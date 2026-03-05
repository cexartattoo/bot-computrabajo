import { useState, useEffect } from 'react'

const API = '/api/history'

export default function History() {
    const [data, setData] = useState({ data: [], total: 0, page: 1, pages: 1 })
    const [stats, setStats] = useState(null)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const load = (p = page) => {
        const params = new URLSearchParams({ page: p, per_page: 20 })
        if (search) params.set('search', search)
        if (statusFilter) params.set('status', statusFilter)
        fetch(`${API}?${params}`).then(r => r.json()).then(d => { setData(d); setPage(d.page) })
    }

    useEffect(() => { load(1) }, [search, statusFilter])
    useEffect(() => {
        fetch(`${API}/stats`).then(r => r.json()).then(setStats)
    }, [])

    const deleteRow = async (id) => {
        if (!confirm('¿Eliminar esta aplicación?')) return
        await fetch(`${API}/${id}`, { method: 'DELETE' })
        load()
        fetch(`${API}/stats`).then(r => r.json()).then(setStats)
    }

    const dedup = async () => {
        const res = await fetch(`${API}/dedup`, { method: 'POST' })
        const d = await res.json()
        alert(`Eliminados: ${d.removed} duplicados`)
        load()
    }

    const exportCSV = () => {
        const params = statusFilter ? `?status=${statusFilter}` : ''
        window.open(`${API}/export${params}`)
    }

    const STATUS_BADGE = {
        applied: 'bg-green-900/50 text-green-400',
        'dry-run': 'bg-blue-900/50 text-blue-400',
        error: 'bg-red-900/50 text-red-400',
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Historial de Aplicaciones</h1>

            {/* Stats cards */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: 'Total', value: stats.total, color: 'text-blue-400' },
                        { label: 'Exitosas', value: stats.applied, color: 'text-green-400' },
                        { label: 'Errores', value: stats.errors, color: 'text-red-400' },
                        { label: 'Hoy', value: stats.today, color: 'text-purple-400' },
                    ].map(s => (
                        <div key={s.label} className="bg-[#1e293b] rounded-xl border border-[#334155] p-4">
                            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="🔍 Buscar cargo o empresa..." className="flex-1 min-w-[200px] bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm" />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm">
                    <option value="">Todos</option>
                    <option value="applied">Exitosas</option>
                    <option value="dry-run">Dry-Run</option>
                    <option value="error">Error</option>
                </select>
                <button onClick={exportCSV} className="px-3 py-2 bg-[#334155] rounded-lg text-sm hover:bg-[#475569]">📥 CSV</button>
                <button onClick={dedup} className="px-3 py-2 bg-[#334155] rounded-lg text-sm hover:bg-[#475569]">🧹 Dedup</button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto bg-[#1e293b] rounded-xl border border-[#334155]">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-[#334155] text-left text-xs text-slate-400">
                            <th className="p-3">Cargo</th>
                            <th className="p-3 hidden sm:table-cell">Empresa</th>
                            <th className="p-3">Estado</th>
                            <th className="p-3 hidden md:table-cell">Fecha</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.data.map(r => (
                            <tr key={r.id} className="border-b border-[#334155]/50 hover:bg-[#334155]/30">
                                <td className="p-3">
                                    {r.url ? <a href={r.url} target="_blank" className="text-blue-400 hover:underline">{(r.job_title || '').slice(0, 40)}</a>
                                        : (r.job_title || '').slice(0, 40)}
                                </td>
                                <td className="p-3 hidden sm:table-cell text-slate-400">{r.company || '-'}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status] || 'bg-slate-700 text-slate-300'}`}>
                                        {r.status}
                                    </span>
                                </td>
                                <td className="p-3 hidden md:table-cell text-slate-500 text-xs">{(r.applied_at || '').slice(0, 16)}</td>
                                <td className="p-3">
                                    <button onClick={() => deleteRow(r.id)} className="text-red-500/50 hover:text-red-400 text-xs">✕</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
                <div className="flex justify-center gap-2">
                    <button onClick={() => load(page - 1)} disabled={page <= 1}
                        className="px-3 py-1 bg-[#334155] rounded text-sm disabled:opacity-30">← Anterior</button>
                    <span className="px-3 py-1 text-sm text-slate-400">{page} / {data.pages}</span>
                    <button onClick={() => load(page + 1)} disabled={page >= data.pages}
                        className="px-3 py-1 bg-[#334155] rounded text-sm disabled:opacity-30">Siguiente →</button>
                </div>
            )}
        </div>
    )
}
