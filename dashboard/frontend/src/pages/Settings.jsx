import { useState, useEffect } from 'react'

const API = '/api'

export default function Settings() {
    const [keywords, setKeywords] = useState([])
    const [newKw, setNewKw] = useState('')
    const [locations, setLocations] = useState([])
    const [newLoc, setNewLoc] = useState('')
    const [blacklist, setBlacklist] = useState([])
    const [newBl, setNewBl] = useState('')
    const [cooldown, setCooldown] = useState(10)
    const [apiKeys, setApiKeys] = useState([])
    const [creds, setCreds] = useState({})
    const [telegram, setTelegram] = useState({})
    const [cvs, setCvs] = useState([])
    const [notifications, setNotifications] = useState({
        telegram_enabled: false,
        browser_enabled: false,
    })
    const [browserNotifSupported, setBrowserNotifSupported] = useState(false)
    const [msg, setMsg] = useState('')

    const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 3000) }

    useEffect(() => {
        fetch(`${API}/config/keywords`).then(r => r.json()).then(d => setKeywords(d.keywords || []))
        fetch(`${API}/config/locations`).then(r => r.json()).then(d => setLocations(d.locations || []))
        fetch(`${API}/config/blacklist`).then(r => r.json()).then(d => setBlacklist(d.blacklist || [])).catch(() => { })
        fetch(`${API}/config/api-keys`).then(r => r.json()).then(d => setApiKeys(d.keys || []))
        fetch(`${API}/config/cvs`).then(r => r.json()).then(d => setCvs(d.cvs || []))
        fetch(`${API}/config/telegram`).then(r => r.json()).then(setTelegram)
        fetch(`${API}/config/notifications`).then(r => r.json()).then(setNotifications).catch(() => { })
        fetch(`${API}/config/cooldown`).then(r => r.json()).then(d => setCooldown(d.cooldown_seconds || 10)).catch(() => { })
        fetch(`${API}/credentials`).then(r => r.json()).then(d => setCreds(d.credentials || {}))
        // Check if browser notifications are supported
        setBrowserNotifSupported('Notification' in window)
    }, [])

    // --- Chips CRUD helpers ---
    const saveKeywords = async () => {
        await fetch(`${API}/config/keywords`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords }),
        })
        flash('Keywords guardadas')
    }
    const addKeyword = () => {
        if (newKw && !keywords.includes(newKw)) { setKeywords(prev => [...prev, newKw]); setNewKw('') }
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
        if (newLoc && !locations.includes(newLoc)) { setLocations(prev => [...prev, newLoc]); setNewLoc('') }
    }
    const removeLocation = (loc) => setLocations(prev => prev.filter(l => l !== loc))

    const saveBlacklist = async () => {
        await fetch(`${API}/config/blacklist`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blacklist }),
        })
        flash('Blacklist guardada')
    }
    const addBlacklist = () => {
        if (newBl && !blacklist.includes(newBl)) { setBlacklist(prev => [...prev, newBl]); setNewBl('') }
    }
    const removeBlacklist = (b) => setBlacklist(prev => prev.filter(x => x !== b))

    const toggleNotification = async (channel, enabled) => {
        const updated = { ...notifications, [channel]: enabled }
        setNotifications(updated)

        // Request browser permission if enabling
        if (channel === 'browser_enabled' && enabled && browserNotifSupported) {
            const perm = await Notification.requestPermission()
            if (perm !== 'granted') {
                setNotifications(prev => ({ ...prev, browser_enabled: false }))
                flash('Permiso de notificaciones denegado por el navegador')
                return
            }
        }

        await fetch(`${API}/config/notifications`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
        })
        flash(`Notificaciones ${enabled ? 'activadas' : 'desactivadas'}`)
    }

    const updateCred = async (key, value) => {
        await fetch(`${API}/credentials`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        })
        flash(`${key} actualizado`)
    }

    const saveCooldown = async () => {
        await fetch(`${API}/config/cooldown`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cooldown_seconds: cooldown }),
        })
        flash('Tiempo de espera guardado')
    }

    const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
    const inputStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold">Configuracion</h1>
                {msg && <span className="text-sm font-medium animate-pulse" style={{ color: 'var(--success)' }}>{msg}</span>}
            </div>

            {/* Notifications */}
            <section className="rounded-xl p-5 space-y-4" style={cardStyle}>
                <h2 className="text-lg font-semibold">Notificaciones</h2>
                <div className="space-y-3">
                    {/* Telegram toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium">Telegram</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {telegram.configured ? 'Bot y Chat ID configurados' : 'Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env'}
                            </p>
                        </div>
                        <button
                            onClick={() => toggleNotification('telegram_enabled', !notifications.telegram_enabled)}
                            disabled={!telegram.configured}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${notifications.telegram_enabled ? 'bg-green-500' : 'bg-slate-600'} ${!telegram.configured ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${notifications.telegram_enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                    {/* Browser notifications toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium">Navegador</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {browserNotifSupported ? 'Web Push Notifications' : 'No soportado en este navegador'}
                            </p>
                        </div>
                        <button
                            onClick={() => toggleNotification('browser_enabled', !notifications.browser_enabled)}
                            disabled={!browserNotifSupported}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${notifications.browser_enabled ? 'bg-green-500' : 'bg-slate-600'} ${!browserNotifSupported ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${notifications.browser_enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                </div>
            </section>

            {/* Keywords */}
            <section className="rounded-xl p-5 space-y-3" style={cardStyle}>
                <h2 className="text-lg font-semibold">Keywords de Busqueda</h2>
                <div className="flex flex-wrap gap-2">
                    {keywords.map(kw => (
                        <span key={kw} className="flex items-center gap-1 px-3 py-1 rounded-full text-sm" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>
                            {kw}
                            <button onClick={() => removeKeyword(kw)} className="ml-1 opacity-50 hover:opacity-100">x</button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input value={newKw} onChange={e => setNewKw(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()}
                        placeholder="Nueva keyword..." className="flex-1 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                    <button onClick={addKeyword} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-hover)' }}>Agregar</button>
                    <button onClick={saveKeywords} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>Guardar</button>
                </div>
            </section>

            {/* Locations */}
            <section className="rounded-xl p-5 space-y-3" style={cardStyle}>
                <h2 className="text-lg font-semibold">Ubicaciones de Busqueda</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ciudades donde buscar ofertas. Incluye "teletrabajo" para remoto.</p>
                <div className="flex flex-wrap gap-2">
                    {locations.map(loc => (
                        <span key={loc} className="flex items-center gap-1 px-3 py-1 rounded-full text-sm" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple)' }}>
                            {loc}
                            <button onClick={() => removeLocation(loc)} className="ml-1 opacity-50 hover:opacity-100">x</button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input value={newLoc} onChange={e => setNewLoc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLocation()}
                        placeholder="Nueva ubicacion..." className="flex-1 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                    <button onClick={addLocation} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-hover)' }}>Agregar</button>
                    <button onClick={saveLocations} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent-purple)', color: '#fff' }}>Guardar</button>
                </div>
            </section>

            {/* Blacklist */}
            <section className="rounded-xl p-5 space-y-3" style={cardStyle}>
                <h2 className="text-lg font-semibold">Lista Negra (Empresas / Palabras)</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>El bot salta ofertas que contengan estas palabras en el titulo o empresa.</p>
                <div className="flex flex-wrap gap-2">
                    {blacklist.map(b => (
                        <span key={b} className="flex items-center gap-1 px-3 py-1 rounded-full text-sm" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--error)' }}>
                            {b}
                            <button onClick={() => removeBlacklist(b)} className="ml-1 opacity-50 hover:opacity-100">x</button>
                        </span>
                    ))}
                    {blacklist.length === 0 && <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Sin empresas bloqueadas.</p>}
                </div>
                <div className="flex gap-2">
                    <input value={newBl} onChange={e => setNewBl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBlacklist()}
                        placeholder="ej: multinivel, comision 100%..." className="flex-1 rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                    <button onClick={addBlacklist} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-hover)' }}>Agregar</button>
                    <button onClick={saveBlacklist} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--error)', color: '#fff' }}>Guardar</button>
                </div>
            </section>

            {/* API Keys */}
            <section className="rounded-xl p-5 space-y-3" style={cardStyle}>
                <h2 className="text-lg font-semibold">API Keys de Gemini</h2>
                <div className="space-y-2">
                    {apiKeys.map(k => (
                        <div key={k.name} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                            <span className={`w-2 h-2 rounded-full ${k.configured ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm font-mono w-40" style={{ color: 'var(--text-secondary)' }}>{k.name}</span>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.preview || 'No configurada'}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Credentials */}
            <section className="rounded-xl p-5 space-y-3" style={cardStyle}>
                <h2 className="text-lg font-semibold">Credenciales</h2>
                {['CT_EMAIL', 'CT_PASSWORD'].map(key => (
                    <div key={key} className="flex items-center gap-3">
                        <span className="text-sm w-32" style={{ color: 'var(--text-secondary)' }}>{key}</span>
                        <input
                            type={key.includes('PASSWORD') ? 'password' : 'text'}
                            defaultValue={creds[key]?.value || ''}
                            placeholder={creds[key]?.configured ? '--------' : 'No configurado'}
                            onBlur={e => { if (e.target.value) updateCred(key, e.target.value) }}
                            className="flex-1 rounded-lg px-3 py-2 text-sm" style={inputStyle}
                        />
                    </div>
                ))}
            </section>

            {/* CVs */}
            <section className="rounded-xl p-5 space-y-3" style={cardStyle}>
                <h2 className="text-lg font-semibold">CVs Disponibles</h2>
                {cvs.map(c => (
                    <div key={c.filename} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span className="text-sm" style={{ color: 'var(--accent)' }}>{c.filename}</span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{c.size_kb} KB</span>
                    </div>
                ))}
            </section>

            {/* Cooldown */}
            <section className="rounded-xl p-5 space-y-3" style={cardStyle}>
                <h2 className="text-lg font-semibold">Tiempo de Espera</h2>
                <div className="flex items-center gap-3">
                    <span className="text-sm w-48" style={{ color: 'var(--text-secondary)' }}>Segundos entre aplicaciones:</span>
                    <input
                        type="number"
                        min="1"
                        value={cooldown}
                        onChange={e => setCooldown(parseInt(e.target.value) || 10)}
                        className="w-24 rounded-lg px-3 py-2 text-sm text-center" style={inputStyle}
                    />
                    <button onClick={saveCooldown} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>
                        Guardar
                    </button>
                </div>
            </section>
        </div>
    )
}
