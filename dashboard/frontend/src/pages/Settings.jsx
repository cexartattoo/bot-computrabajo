import { useState, useEffect } from 'react'

const API = '/api'

export default function Settings() {
    const [keywords, setKeywords] = useState([])
    const [newKw, setNewKw] = useState('')
    const [locations, setLocations] = useState([])
    const [newLoc, setNewLoc] = useState('')
    const [apiKeys, setApiKeys] = useState([])
    const [creds, setCreds] = useState({})
    const [telegram, setTelegram] = useState({})
    const [cvs, setCvs] = useState([])
    const [msg, setMsg] = useState('')

    const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 3000) }

    useEffect(() => {
        fetch(`${API}/config/keywords`).then(r => r.json()).then(d => setKeywords(d.keywords || []))
        fetch(`${API}/config/locations`).then(r => r.json()).then(d => setLocations(d.locations || []))
        fetch(`${API}/config/api-keys`).then(r => r.json()).then(d => setApiKeys(d.keys || []))
        fetch(`${API}/config/cvs`).then(r => r.json()).then(d => setCvs(d.cvs || []))
        fetch(`${API}/config/telegram`).then(r => r.json()).then(setTelegram)
        fetch(`${API}/credentials`).then(r => r.json()).then(d => setCreds(d.credentials || {}))
    }, [])

    const saveKeywords = async () => {
        await fetch(`${API}/config/keywords`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords }),
        })
        flash('Keywords guardadas')
    }

    const addKeyword = () => {
        if (newKw && !keywords.includes(newKw)) {
            setKeywords(prev => [...prev, newKw])
            setNewKw('')
        }
    }

    const removeKeyword = (kw) => setKeywords(prev => prev.filter(k => k !== kw))

    const saveLocations = async () => {
        await fetch(`${API}/config/locations`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations }),
        })
        flash('Ubicaciones guardadas')
    }

    const addLocation = () => {
        if (newLoc && !locations.includes(newLoc)) {
            setLocations(prev => [...prev, newLoc])
            setNewLoc('')
        }
    }

    const removeLocation = (loc) => setLocations(prev => prev.filter(l => l !== loc))

    const updateCred = async (key, value) => {
        await fetch(`${API}/credentials`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        })
        flash(`${key} actualizado`)
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold">Configuracion</h1>
                {msg && <span className="text-sm font-medium text-green-400 animate-pulse">{msg}</span>}
            </div>

            {/* Keywords */}
            <section className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-3">
                <h2 className="text-lg font-semibold">Keywords de Busqueda</h2>
                <div className="flex flex-wrap gap-2">
                    {keywords.map(kw => (
                        <span key={kw} className="flex items-center gap-1 px-3 py-1 bg-blue-900/30 text-blue-400 rounded-full text-sm">
                            {kw}
                            <button onClick={() => removeKeyword(kw)} className="text-blue-400/50 hover:text-red-400 ml-1">x</button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input value={newKw} onChange={e => setNewKw(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()}
                        placeholder="Nueva keyword..." className="flex-1 bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm" />
                    <button onClick={addKeyword} className="px-4 py-2 bg-[#334155] rounded-lg text-sm hover:bg-[#475569]">Agregar</button>
                    <button onClick={saveKeywords} className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold">Guardar</button>
                </div>
            </section>

            {/* Locations */}
            <section className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-3">
                <h2 className="text-lg font-semibold">Ubicaciones de Busqueda</h2>
                <p className="text-xs text-slate-500">Ciudades donde buscar ofertas. Incluye "teletrabajo" para incluir remoto.</p>
                <div className="flex flex-wrap gap-2">
                    {locations.map(loc => (
                        <span key={loc} className="flex items-center gap-1 px-3 py-1 bg-purple-900/30 text-purple-400 rounded-full text-sm">
                            {loc}
                            <button onClick={() => removeLocation(loc)} className="text-purple-400/50 hover:text-red-400 ml-1">x</button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input value={newLoc} onChange={e => setNewLoc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLocation()}
                        placeholder="Nueva ubicacion..." className="flex-1 bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm" />
                    <button onClick={addLocation} className="px-4 py-2 bg-[#334155] rounded-lg text-sm hover:bg-[#475569]">Agregar</button>
                    <button onClick={saveLocations} className="px-4 py-2 bg-purple-600 rounded-lg text-sm font-semibold">Guardar</button>
                </div>
            </section>

            {/* API Keys */}
            <section className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-3">
                <h2 className="text-lg font-semibold">API Keys de Gemini</h2>
                <div className="space-y-2">
                    {apiKeys.map(k => (
                        <div key={k.name} className="flex items-center gap-3 py-2 border-b border-[#334155]/50 last:border-0">
                            <span className={`w-2 h-2 rounded-full ${k.configured ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm font-mono text-slate-400 w-40">{k.name}</span>
                            <span className="text-xs text-slate-500">{k.preview || 'No configurada'}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Credentials */}
            <section className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-3">
                <h2 className="text-lg font-semibold">Credenciales</h2>
                {['CT_EMAIL', 'CT_PASSWORD'].map(key => (
                    <div key={key} className="flex items-center gap-3">
                        <span className="text-sm text-slate-400 w-32">{key}</span>
                        <input
                            type={key.includes('PASSWORD') ? 'password' : 'text'}
                            defaultValue={creds[key]?.value || ''}
                            placeholder={creds[key]?.configured ? '--------' : 'No configurado'}
                            onBlur={e => { if (e.target.value) updateCred(key, e.target.value) }}
                            className="flex-1 bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                ))}
            </section>

            {/* CVs */}
            <section className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-3">
                <h2 className="text-lg font-semibold">CVs Disponibles</h2>
                {cvs.map(c => (
                    <div key={c.filename} className="flex items-center gap-3 py-2 border-b border-[#334155]/50 last:border-0">
                        <span className="text-blue-400 text-sm">{c.filename}</span>
                        <span className="text-xs text-slate-500 ml-auto">{c.size_kb} KB</span>
                    </div>
                ))}
            </section>

            {/* Telegram */}
            <section className="bg-[#1e293b] rounded-xl border border-[#334155] p-5 space-y-3">
                <h2 className="text-lg font-semibold">Telegram</h2>
                <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${telegram.configured ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm">{telegram.configured ? 'Configurado' : 'No configurado'}</span>
                </div>
                <p className="text-xs text-slate-500">
                    Agrega <code className="bg-[#0f172a] px-1 rounded">TELEGRAM_BOT_TOKEN</code> y{' '}
                    <code className="bg-[#0f172a] px-1 rounded">TELEGRAM_CHAT_ID</code> en tu .env
                </p>
            </section>
        </div>
    )
}
