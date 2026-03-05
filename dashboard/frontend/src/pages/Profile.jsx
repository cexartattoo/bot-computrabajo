import { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'

const API = '/api'

export default function Profile() {
    const [tab, setTab] = useState('cv') // 'cv' | 'knowledge'
    const [cvRaw, setCvRaw] = useState('')
    const [knowledgeRaw, setKnowledgeRaw] = useState('')
    const [knowledgeFields, setKnowledgeFields] = useState({})
    const [knowledgeView, setKnowledgeView] = useState('fields') // 'fields' | 'code'
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState('')
    const [theme, setTheme] = useState('vs-dark')

    useEffect(() => {
        fetch(`${API}/profile/cv/raw`).then(r => r.json()).then(d => setCvRaw(d.raw)).catch(() => { })
        fetch(`${API}/knowledge`).then(r => r.json()).then(d => {
            setKnowledgeFields(d.data || {})
            setKnowledgeRaw(JSON.stringify(d.data || {}, null, 2))
        }).catch(() => { })

        // Check current body theme element
        const isLight = document.documentElement.getAttribute('data-theme') === 'light'
        setTheme(isLight ? 'light' : 'vs-dark')

        // Observe theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    const l = document.documentElement.getAttribute('data-theme') === 'light'
                    setTheme(l ? 'light' : 'vs-dark')
                }
            })
        })
        observer.observe(document.documentElement, { attributes: true })
        return () => observer.disconnect()
    }, [])

    const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 3000) }

    const saveCv = async () => {
        setSaving(true)
        try {
            const res = await fetch(`${API}/profile/cv`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw: cvRaw }),
            })
            const d = await res.json()
            if (d.saved) flash('✅ cv_data.json guardado con backup')
            else flash('❌ ' + (d.detail || 'Error'))
        } catch { flash('❌ Error de conexión') }
        setSaving(false)
    }

    const saveKnowledge = async () => {
        setSaving(true)
        const dataToSave = knowledgeView === 'code' ? JSON.parse(knowledgeRaw) : knowledgeFields
        try {
            const res = await fetch(`${API}/knowledge`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: dataToSave }),
            })
            const d = await res.json()
            if (d.saved) {
                flash(`✅ Guardado (${d.count} campos)`)
                setKnowledgeFields(dataToSave)
                setKnowledgeRaw(JSON.stringify(dataToSave, null, 2))
            }
        } catch { flash('❌ Error') }
        setSaving(false)
    }

    const addField = () => {
        const key = prompt('Nombre del campo nuevo:')
        if (key) {
            setKnowledgeFields(prev => ({ ...prev, [key]: '' }))
        }
    }

    const deleteField = (key) => {
        setKnowledgeFields(prev => {
            const next = { ...prev }
            delete next[key]
            return next
        })
    }

    const updateField = (key, value) => {
        setKnowledgeFields(prev => ({ ...prev, [key]: value }))
    }

    const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
    const input = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold">Mi Perfil</h1>
                {msg && <span className="text-sm font-semibold animate-pulse" style={{ color: 'var(--success)' }}>{msg}</span>}
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <button onClick={() => setTab('cv')}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition"
                    style={{
                        background: tab === 'cv' ? 'var(--accent)' : 'var(--bg-hover)',
                        color: tab === 'cv' ? '#fff' : 'var(--text-secondary)'
                    }}>
                    📄 cv_data.json
                </button>
                <button onClick={() => setTab('knowledge')}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition"
                    style={{
                        background: tab === 'knowledge' ? 'var(--accent-purple)' : 'var(--bg-hover)',
                        color: tab === 'knowledge' ? '#fff' : 'var(--text-secondary)'
                    }}>
                    🧠 Conocimiento ({Object.keys(knowledgeFields).length})
                </button>
            </div>

            {/* CV Editor */}
            {tab === 'cv' && (
                <div className="space-y-3">
                    <div className="rounded-xl overflow-hidden" style={card}>
                        <Editor height="60vh" language="json" theme={theme} value={cvRaw}
                            onChange={v => setCvRaw(v || '')}
                            options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', lineNumbers: 'on' }} />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={saveCv} disabled={saving}
                            className="px-5 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 hover:opacity-90"
                            style={{ background: 'var(--accent)', color: '#fff' }}>
                            💾 Guardar
                        </button>
                        <button onClick={() => setCvRaw(JSON.stringify(JSON.parse(cvRaw), null, 2))}
                            className="px-5 py-2 rounded-lg text-sm transition hover:opacity-80"
                            style={{ background: 'var(--bg-hover)' }}>
                            📐 Formatear
                        </button>
                    </div>
                </div>
            )}

            {/* Knowledge Editor */}
            {tab === 'knowledge' && (
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <button onClick={() => setKnowledgeView('fields')}
                            className="px-3 py-1.5 rounded text-xs font-semibold transition"
                            style={{
                                background: knowledgeView === 'fields' ? 'var(--accent-purple)' : 'var(--bg-hover)',
                                color: knowledgeView === 'fields' ? '#fff' : 'var(--text-secondary)'
                            }}>
                            📋 Vista Campos
                        </button>
                        <button onClick={() => { setKnowledgeView('code'); setKnowledgeRaw(JSON.stringify(knowledgeFields, null, 2)) }}
                            className="px-3 py-1.5 rounded text-xs font-semibold transition"
                            style={{
                                background: knowledgeView === 'code' ? 'var(--accent-purple)' : 'var(--bg-hover)',
                                color: knowledgeView === 'code' ? '#fff' : 'var(--text-secondary)'
                            }}>
                            {'</>'} Vista Código
                        </button>
                    </div>

                    {knowledgeView === 'fields' ? (
                        <div className="space-y-2">
                            {Object.entries(knowledgeFields).map(([key, value]) => (
                                <div key={key} className="flex gap-2 items-center rounded-lg p-3" style={card}>
                                    <span className="text-xs font-semibold min-w-[140px] truncate" style={{ color: 'var(--accent-purple)' }}>{key}</span>
                                    <input type="text" value={value} onChange={e => updateField(key, e.target.value)}
                                        className="flex-1 rounded px-2 py-1.5 text-sm" style={input} />
                                    <button onClick={() => deleteField(key)} className="text-red-500 opacity-50 hover:opacity-100 text-sm">✕</button>
                                </div>
                            ))}
                            <button onClick={addField}
                                className="w-full py-2.5 border border-dashed rounded-lg text-sm transition hover:opacity-80"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                                + Agregar campo
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-xl overflow-hidden" style={card}>
                            <Editor height="40vh" language="json" theme={theme} value={knowledgeRaw}
                                onChange={v => setKnowledgeRaw(v || '')}
                                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }} />
                        </div>
                    )}

                    <button onClick={saveKnowledge} disabled={saving}
                        className="px-5 py-2.5 rounded-lg text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
                        style={{ background: 'var(--accent-purple)', color: '#fff' }}>
                        💾 Guardar Conocimiento
                    </button>
                </div>
            )}
        </div>
    )
}
