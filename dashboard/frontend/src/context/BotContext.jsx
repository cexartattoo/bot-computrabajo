import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const BotContext = createContext(null)
const API = '/api'

export function BotProvider({ children }) {
    const [status, setStatus] = useState({ status: 'disconnected', mode: 'apply', apps_this_session: 0, log_tail: [] })
    const [logs, setLogs] = useState([])
    const [reviewQueue, setReviewQueue] = useState([])
    const [reportUrl, setReportUrl] = useState(null)
    const [aiProcessing, setAiProcessing] = useState(false)
    const wsRef = useRef(null)

    // Poll bot status
    useEffect(() => {
        const fetchStatus = () => {
            fetch(`${API}/bot/status`)
                .then(r => r.json())
                .then(d => setStatus(d))
                .catch(() => setStatus(prev => ({ ...prev, status: 'disconnected' })))
        }
        fetchStatus()
        const interval = setInterval(fetchStatus, 5000)
        return () => clearInterval(interval)
    }, [])

    // Clear AI processing on bot stop/pause
    useEffect(() => {
        if (status.status !== 'running') {
            setAiProcessing(false)
        }
    }, [status.status])

    // Persistent WebSocket -- lives for the entire app lifetime
    useEffect(() => {
        let ws
        let reconnectTimer
        const connect = () => {
            const proto = location.protocol === 'https:' ? 'wss' : 'ws'
            ws = new WebSocket(`${proto}://${location.host}/api/bot/ws`)
            ws.onmessage = (e) => {
                const data = e.data
                // Try JSON parse for review requests and missing data
                if (data.startsWith('{') || data.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(data)
                        if (parsed.type === 'review_request' || parsed.type === 'missing_data' || parsed.type === 'questions_detected') {
                            setReviewQueue(prev => [...prev, parsed])
                            if (parsed.type === 'questions_detected') setAiProcessing(true)
                            if (parsed.type === 'review_request' || parsed.type === 'missing_data') setAiProcessing(false)
                            return // Don't add structured JSON to text logs
                        }
                    } catch {
                        // Not JSON, treat as text log
                    }
                }

                // Track AI state via text logs
                if (data.includes('Generando resumen IA')) setAiProcessing(true)
                if (data.includes('[RESPUESTA IA]') || data.includes('Error inyectando script de extraccion')) setAiProcessing(false)
                // Regular log line
                setLogs(prev => {
                    const next = [...prev, data]
                    return next.length > 500 ? next.slice(-500) : next
                })
                if (data.includes('[SYSTEM]')) {
                    fetch(`${API}/bot/status`).then(r => r.json()).then(setStatus).catch(() => { })
                }
                if (data.includes('[REPORT]') || data.includes('Informe generado')) {
                    const match = data.match(/informe_[\w]+\.html/)
                    if (match) setReportUrl(`${API}/reports/${match[0]}`)
                }
            }
            ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000) }
            ws.onerror = () => { ws.close() }
            wsRef.current = ws
        }
        connect()
        return () => { clearTimeout(reconnectTimer); ws?.close() }
    }, [])

    const clearLogs = useCallback(() => setLogs([]), [])
    const popReview = useCallback(() => {
        setReviewQueue(prev => prev.slice(1))
    }, [])

    const value = {
        status, setStatus,
        logs, clearLogs,
        reviewQueue, popReview,
        reportUrl, setReportUrl,
        aiProcessing, setAiProcessing,
    }

    return <BotContext.Provider value={value}>{children}</BotContext.Provider>
}

export function useBot() {
    const ctx = useContext(BotContext)
    if (!ctx) throw new Error('useBot must be used within BotProvider')
    return ctx
}
