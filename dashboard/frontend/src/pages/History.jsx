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
        applied: { color: 'var(--success)' },
        'dry-run': { color: 'var(--accent)' },
        error: { color: 'var(--error)' },
    }

    const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
    const input = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Historial de Aplicaciones</h1>

            {/* Stats cards */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: 'Total', value: stats.total, color: 'var(--accent)' },
                        { label: 'Exitosas', value: stats.applied, color: 'var(--success)' },
                        { label: 'Errores', value: stats.errors, color: 'var(--error)' },
                        { label: 'Hoy', value: stats.today, color: 'var(--accent-purple)' },
                    ].map(s => (
                        <div key={s.label} className="rounded-xl p-4" style={card}>
                            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="🔍 Buscar cargo o empresa..." className="flex-1 min-w-[200px] rounded-lg px-3 py-2 text-sm" style={input} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm" style={input}>
                    <option value="">Todos</option>
                    <option value="applied">Exitosas</option>
                    <option value="dry-run">Dry-Run</option>
                    <option value="error">Error</option>
                </select>
                <button onClick={exportCSV} className="px-3 py-2 rounded-lg text-sm transition hover:opacity-80" style={{ background: 'var(--bg-hover)' }}>📥 CSV</button>
                <button onClick={dedup} className="px-3 py-2 rounded-lg text-sm transition hover:opacity-80" style={{ background: 'var(--bg-hover)' }}>🧹 Dedup</button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                            <th className="p-3">Cargo</th>
                            <th className="p-3 hidden sm:table-cell">Empresa</th>
                            <th className="p-3 text-center">Estado</th>
                            <th className="p-3 hidden md:table-cell text-right">Fecha</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.data.map(r => {
                            const badge = STATUS_BADGE[r.status] || { color: 'var(--text-muted)' }
                            return (
                                <tr key={r.id} className="transition" style={{ borderBottom: '1px solid var(--border)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td className="p-3">
                                        {r.url ? <a href={r.url} target="_blank" className="hover:underline" style={{ color: 'var(--accent)' }}>{(r.job_title || '').slice(0, 40)}</a>
                                            : (r.job_title || '').slice(0, 40)}
                                    </td>
                                    <td className="p-3 hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>{r.company || '-'}</td>
                                    <td className="p-3 text-center">
                                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                            style={{ backgroundColor: badge.color + '22', color: badge.color }}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="p-3 hidden md:table-cell text-xs text-right" style={{ color: 'var(--text-muted)' }}>{(r.applied_at || '').slice(0, 16)}</td>
                                    <td className="p-3 text-center">
                                        <button onClick={() => deleteRow(r.id)} className="text-red-500 opacity-50 hover:opacity-100 text-xs">✕</button>
                                    </td>
                                </tr>
                            )
                        })}
                        {data.data.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-6 text-center italic text-sm" style={{ color: 'var(--text-muted)' }}>
                                    No hay resultados en el historial.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
                <div className="flex justify-center items-center gap-3">
                    <button onClick={() => load(page - 1)} disabled={page <= 1}
                        className="px-3 py-1.5 rounded-lg text-sm transition font-medium hover:opacity-80 disabled:opacity-30" style={{ background: 'var(--bg-hover)' }}>← Anterior</button>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{page} / {data.pages}</span>
                    <button onClick={() => load(page + 1)} disabled={page >= data.pages}
                        className="px-3 py-1.5 rounded-lg text-sm transition font-medium hover:opacity-80 disabled:opacity-30" style={{ background: 'var(--bg-hover)' }}>Siguiente →</button>
                </div>
            )}
        </div>
    )
}
