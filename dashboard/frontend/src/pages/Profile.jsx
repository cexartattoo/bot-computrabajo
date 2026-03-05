import { useState, useEffect, useCallback } from 'react'
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

    useEffect(() => {
        fetch(`${API}/profile/cv/raw`).then(r => r.json()).then(d => setCvRaw(d.raw)).catch(() => { })
        fetch(`${API}/knowledge`).then(r => r.json()).then(d => {
            setKnowledgeFields(d.data || {})
            setKnowledgeRaw(JSON.stringify(d.data || {}, null, 2))
        }).catch(() => { })
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

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold">Mi Perfil</h1>
                {msg && <span className="text-sm font-medium animate-pulse">{msg}</span>}
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <button onClick={() => setTab('cv')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'cv' ? 'bg-blue-600 text-white' : 'bg-[#334155] text-slate-400 hover:text-white'}`}>
                    📄 cv_data.json
                </button>
                <button onClick={() => setTab('knowledge')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'knowledge' ? 'bg-purple-600 text-white' : 'bg-[#334155] text-slate-400 hover:text-white'}`}>
                    🧠 Conocimiento ({Object.keys(knowledgeFields).length})
                </button>
            </div>

            {/* CV Editor */}
            {tab === 'cv' && (
                <div className="space-y-3">
                    <div className="rounded-xl overflow-hidden border border-[#334155]">
                        <Editor height="60vh" language="json" theme="vs-dark" value={cvRaw}
                            onChange={v => setCvRaw(v || '')}
                            options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', lineNumbers: 'on' }} />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={saveCv} disabled={saving}
                            className="px-5 py-2 bg-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                            💾 Guardar
                        </button>
                        <button onClick={() => setCvRaw(JSON.stringify(JSON.parse(cvRaw), null, 2))}
                            className="px-5 py-2 bg-[#334155] rounded-lg text-sm hover:bg-[#475569]">
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
                            className={`px-3 py-1.5 rounded text-xs font-medium ${knowledgeView === 'fields' ? 'bg-purple-600 text-white' : 'bg-[#334155] text-slate-400'}`}>
                            📋 Vista Campos
                        </button>
                        <button onClick={() => { setKnowledgeView('code'); setKnowledgeRaw(JSON.stringify(knowledgeFields, null, 2)) }}
                            className={`px-3 py-1.5 rounded text-xs font-medium ${knowledgeView === 'code' ? 'bg-purple-600 text-white' : 'bg-[#334155] text-slate-400'}`}>
                            {'</>'} Vista Código
                        </button>
                    </div>

                    {knowledgeView === 'fields' ? (
                        <div className="space-y-2">
                            {Object.entries(knowledgeFields).map(([key, value]) => (
                                <div key={key} className="flex gap-2 items-center bg-[#1e293b] rounded-lg border border-[#334155] p-3">
                                    <span className="text-xs text-purple-400 font-semibold min-w-[140px] truncate">{key}</span>
                                    <input type="text" value={value} onChange={e => updateField(key, e.target.value)}
                                        className="flex-1 bg-[#0f172a] border border-[#334155] rounded px-2 py-1 text-sm" />
                                    <button onClick={() => deleteField(key)} className="text-red-500/50 hover:text-red-400 text-sm">✕</button>
                                </div>
                            ))}
                            <button onClick={addField}
                                className="w-full py-2 border border-dashed border-[#334155] rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:border-[#475569]">
                                + Agregar campo
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-xl overflow-hidden border border-[#334155]">
                            <Editor height="40vh" language="json" theme="vs-dark" value={knowledgeRaw}
                                onChange={v => setKnowledgeRaw(v || '')}
                                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }} />
                        </div>
                    )}

                    <button onClick={saveKnowledge} disabled={saving}
                        className="px-5 py-2 bg-purple-600 rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
                        💾 Guardar Conocimiento
                    </button>
                </div>
            )}
        </div>
    )
}
