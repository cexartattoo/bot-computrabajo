import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Profile from './pages/Profile'
import Settings from './pages/Settings'

const NAV = [
    { path: '/', label: '🏠 Panel', el: <Dashboard /> },
    { path: '/history', label: '📋 Historial', el: <History /> },
    { path: '/profile', label: '👤 Perfil', el: <Profile /> },
    { path: '/settings', label: '⚙️ Config', el: <Settings /> },
]

export default function App() {
    return (
        <BrowserRouter>
            <div className="min-h-screen flex flex-col">
                {/* Top nav — mobile friendly */}
                <nav className="bg-[#1e293b] border-b border-[#334155] sticky top-0 z-50">
                    <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
                        <span className="text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                            César Bot
                        </span>
                        <div className="flex gap-1">
                            {NAV.map(n => (
                                <NavLink
                                    key={n.path}
                                    to={n.path}
                                    end={n.path === '/'}
                                    className={({ isActive }) =>
                                        `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                            ? 'bg-blue-600/20 text-blue-400'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#334155]'
                                        }`
                                    }
                                >
                                    {n.label}
                                </NavLink>
                            ))}
                        </div>
                    </div>
                </nav>

                {/* Main content */}
                <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
                    <Routes>
                        {NAV.map(n => (
                            <Route key={n.path} path={n.path} element={n.el} />
                        ))}
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    )
}
