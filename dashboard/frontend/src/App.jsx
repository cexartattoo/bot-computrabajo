import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { BotProvider, useBot } from './context/BotContext'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Results from './pages/Results'
import Review from './pages/Review'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import ThemeToggle from './components/ThemeToggle'
import BotStream from './components/BotStream'

const NAV = [
    { path: '/', label: 'Panel' },
    { path: '/review', label: 'Revision' },
    { path: '/results', label: 'Resultados' },
    { path: '/history', label: 'Historial' },
    { path: '/profile', label: 'Perfil' },
    { path: '/settings', label: 'Config' },
]

function MiniLogStrip() {
    const { logs, status } = useBot()
    const [expanded, setExpanded] = useState(false)
    const logRef = useRef(null)
    const isRunning = status.status === 'running' || status.status === 'paused'

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, [logs, expanded])

    if (!isRunning && logs.length === 0) return null

    const lastLine = logs.length > 0 ? logs[logs.length - 1] : ''

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 transition-all"
            style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
            {/* Collapsed strip: single line */}
            <button onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:opacity-90 transition">
                {isRunning && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
                <span className="flex-1 font-mono text-[11px] truncate" style={{
                    color: lastLine.includes('[OK]') ? 'var(--success)' :
                        lastLine.includes('[WARN]') ? 'var(--warning)' :
                            lastLine.includes('[ERROR]') ? 'var(--error)' :
                                lastLine.includes('[SYSTEM]') ? 'var(--accent)' : 'var(--text-muted)',
                }}>
                    {lastLine || 'Sin actividad'}
                </span>
                <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {logs.length} lineas
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {/* Expanded: last 20 lines */}
            {expanded && (
                <div ref={logRef} className="h-32 overflow-y-auto px-4 pb-2 font-mono text-[11px] space-y-0.5"
                    style={{ borderTop: '1px solid var(--border)' }}>
                    {logs.slice(-30).map((line, i) => (
                        <div key={i} style={{
                            color: line.includes('[OK]') ? 'var(--success)' :
                                line.includes('[WARN]') ? 'var(--warning)' :
                                    line.includes('[ERROR]') ? 'var(--error)' :
                                        line.includes('[SYSTEM]') ? 'var(--accent)' : 'var(--text-muted)',
                        }}>{line}</div>
                    ))}
                </div>
            )}
        </div>
    )
}

function AppShell() {
    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Top nav */}
            <nav style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }} className="sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
                    <span className="text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                        Cesar Bot
                    </span>
                    <div className="flex items-center gap-1">
                        {NAV.map(n => (
                            <NavLink
                                key={n.path}
                                to={n.path}
                                end={n.path === '/'}
                                className={({ isActive }) =>
                                    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                        ? 'text-blue-400'
                                        : 'hover:text-slate-200'
                                    }`
                                }
                                style={({ isActive }) => ({
                                    backgroundColor: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                })}
                            >
                                {n.label}
                            </NavLink>
                        ))}
                        <div className="ml-2 border-l pl-2" style={{ borderColor: 'var(--border)' }}>
                            <ThemeToggle />
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main content -- add bottom padding for mini log strip */}
            <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 pb-16">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/review" element={<Review />} />
                    <Route path="/results" element={<Results />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/settings" element={<Settings />} />
                </Routes>
            </main>

            {/* Global mini-log strip at bottom */}
            <MiniLogStrip />
            {/* Global floating window for bot livestream */}
            <BotStream />
        </div>
    )
}

export default function App() {
    return (
        <BrowserRouter>
            <BotProvider>
                <AppShell />
            </BotProvider>
        </BrowserRouter>
    )
}
