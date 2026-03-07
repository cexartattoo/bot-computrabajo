import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { BotProvider, useBot } from './context/BotContext'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Results from './pages/Results'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import ThemeToggle from './components/ThemeToggle'
import BotStream from './components/BotStream'

const NAV = [
    { path: '/', label: 'Panel' },
    { path: '/results', label: 'Resultados' },
    { path: '/history', label: 'Historial' },
    { path: '/profile', label: 'Perfil' },
    { path: '/settings', label: 'Config' },
]

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

            {/* Main content -- no bottom padding needed without floating strip */}
            <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/results" element={<Results />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/settings" element={<Settings />} />
                </Routes>
            </main>

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
