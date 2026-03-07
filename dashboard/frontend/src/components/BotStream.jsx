import { useState, useRef, useEffect, useCallback } from 'react'
import { useBot } from '../context/BotContext'

const API = '/api'

/* ══════════════════════════════════════════════════════════════
   SVG State Indicators (from bot_states.html)
   ══════════════════════════════════════════════════════════════ */

function BotOfflineSVG() {
    return (
        <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="glow_off" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#2a2a3e" />
                    <stop offset="100%" stopColor="#111122" />
                </radialGradient>
            </defs>
            <circle cx="80" cy="80" r="72" fill="url(#glow_off)" stroke="#2a2a4a" strokeWidth="1.5" />
            <rect x="44" y="68" width="72" height="52" rx="10" fill="#1e1e32" stroke="#333355" strokeWidth="1.5" />
            <rect x="52" y="38" width="56" height="38" rx="9" fill="#1e1e32" stroke="#333355" strokeWidth="1.5" />
            <line x1="80" y1="38" x2="80" y2="26" stroke="#333355" strokeWidth="2" strokeLinecap="round" />
            <circle cx="80" cy="23" r="4" fill="#2a2a3e" stroke="#333355" strokeWidth="1.5" />
            <line x1="62" y1="52" x2="70" y2="60" stroke="#444466" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="70" y1="52" x2="62" y2="60" stroke="#444466" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="90" y1="52" x2="98" y2="60" stroke="#444466" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="98" y1="52" x2="90" y2="60" stroke="#444466" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 66 72 Q 80 68 94 72" stroke="#444466" strokeWidth="2" fill="none" strokeLinecap="round" />
            <rect x="54" y="82" width="52" height="26" rx="5" fill="#161628" stroke="#2a2a44" strokeWidth="1" />
            <circle cx="66" cy="95" r="5" fill="#1a1a2e" stroke="#333" strokeWidth="1" />
            <circle cx="80" cy="95" r="5" fill="#1a1a2e" stroke="#333" strokeWidth="1" />
            <circle cx="94" cy="95" r="5" fill="#1a1a2e" stroke="#333" strokeWidth="1" />
            <rect x="26" y="72" width="18" height="10" rx="5" fill="#1e1e32" stroke="#333355" strokeWidth="1.5" />
            <rect x="116" y="72" width="18" height="10" rx="5" fill="#1e1e32" stroke="#333355" strokeWidth="1.5" />
            <text x="80" y="138" textAnchor="middle" fill="#333355" fontSize="11" fontFamily="monospace" fontWeight="bold">OFFLINE</text>
        </svg>
    )
}

function BotLoadingSVG() {
    return (
        <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="glow_load" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1a2a4a" />
                    <stop offset="100%" stopColor="#0d1520" />
                </radialGradient>
                <filter id="blur_load"><feGaussianBlur stdDeviation="3" /></filter>
            </defs>
            <circle cx="80" cy="80" r="68" fill="none" stroke="#2060ff" strokeWidth="1" opacity="0.3" filter="url(#blur_load)" />
            <circle cx="80" cy="80" r="72" fill="url(#glow_load)" stroke="#1a3060" strokeWidth="1.5" />
            <circle cx="80" cy="80" r="70" fill="none" stroke="#0040cc" strokeWidth="3" strokeDasharray="180 260" strokeLinecap="round" opacity="0.6">
                <animateTransform attributeName="transform" type="rotate" from="0 80 80" to="360 80 80" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="80" cy="80" r="70" fill="none" stroke="#4488ff" strokeWidth="2" strokeDasharray="60 380" strokeLinecap="round" opacity="0.9">
                <animateTransform attributeName="transform" type="rotate" from="0 80 80" to="360 80 80" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <rect x="44" y="68" width="72" height="52" rx="10" fill="#162040" stroke="#2050aa" strokeWidth="1.5" />
            <rect x="52" y="38" width="56" height="38" rx="9" fill="#162040" stroke="#2050aa" strokeWidth="1.5" />
            <line x1="80" y1="38" x2="80" y2="26" stroke="#4488ff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="80" cy="23" r="4" fill="#2060cc">
                <animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite" />
            </circle>
            <circle cx="66" cy="56" r="6" fill="#1040aa">
                <animate attributeName="fill" values="#1040aa;#4488ff;#1040aa" dur="1s" repeatCount="indefinite" />
            </circle>
            <circle cx="94" cy="56" r="6" fill="#1040aa">
                <animate attributeName="fill" values="#1040aa;#4488ff;#1040aa" dur="1s" begin="0.5s" repeatCount="indefinite" />
            </circle>
            <rect x="68" y="70" width="24" height="3" rx="1.5" fill="#2050aa" />
            <rect x="54" y="82" width="52" height="26" rx="5" fill="#0e1830" stroke="#1a3a7a" strokeWidth="1" />
            <rect x="58" y="91" width="44" height="5" rx="2.5" fill="#0a1020" />
            <rect x="58" y="91" width="10" height="5" rx="2.5" fill="#2060ff">
                <animate attributeName="width" values="0;44;0" dur="1.5s" repeatCount="indefinite" />
            </rect>
            <circle cx="66" cy="103" r="3" fill="#2040aa">
                <animate attributeName="opacity" values="1;0.1;1" dur="0.8s" begin="0s" repeatCount="indefinite" />
            </circle>
            <circle cx="80" cy="103" r="3" fill="#2040aa">
                <animate attributeName="opacity" values="1;0.1;1" dur="0.8s" begin="0.27s" repeatCount="indefinite" />
            </circle>
            <circle cx="94" cy="103" r="3" fill="#2040aa">
                <animate attributeName="opacity" values="1;0.1;1" dur="0.8s" begin="0.54s" repeatCount="indefinite" />
            </circle>
            <rect x="26" y="72" width="18" height="10" rx="5" fill="#162040" stroke="#2050aa" strokeWidth="1.5" />
            <rect x="116" y="72" width="18" height="10" rx="5" fill="#162040" stroke="#2050aa" strokeWidth="1.5" />
            <text x="80" y="138" textAnchor="middle" fill="#2050aa" fontSize="11" fontFamily="monospace" fontWeight="bold">INICIANDO...</text>
        </svg>
    )
}

function BotDoneSVG() {
    return (
        <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="glow_done" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1a2e1a" />
                    <stop offset="100%" stopColor="#0d160d" />
                </radialGradient>
            </defs>
            <circle cx="80" cy="80" r="72" fill="url(#glow_done)" stroke="#1a3a1a" strokeWidth="1.5" />
            <circle cx="80" cy="80" r="68" fill="none" stroke="#20cc44" strokeWidth="1" opacity="0.15" />
            <rect x="44" y="68" width="72" height="52" rx="10" fill="#162216" stroke="#204420" strokeWidth="1.5" />
            <rect x="52" y="38" width="56" height="38" rx="9" fill="#162216" stroke="#204420" strokeWidth="1.5" />
            <line x1="80" y1="38" x2="80" y2="26" stroke="#30aa44" strokeWidth="2" strokeLinecap="round" />
            <circle cx="80" cy="23" r="4" fill="#20882a" stroke="#30aa44" strokeWidth="1" />
            <path d="M 60 58 Q 66 52 72 58" stroke="#22cc44" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M 88 58 Q 94 52 100 58" stroke="#22cc44" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M 66 70 Q 80 78 94 70" stroke="#22cc44" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <rect x="54" y="82" width="52" height="26" rx="5" fill="#0e1a0e" stroke="#1a3a1a" strokeWidth="1" />
            <path d="M 66 95 L 76 105 L 97 84" stroke="#22cc44" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="26" y="76" width="18" height="10" rx="5" fill="#162216" stroke="#204420" strokeWidth="1.5" transform="rotate(15 35 81)" />
            <rect x="116" y="76" width="18" height="10" rx="5" fill="#162216" stroke="#204420" strokeWidth="1.5" transform="rotate(-15 125 81)" />
            <text x="110" y="46" fill="#22cc44" fontSize="9" fontFamily="monospace" opacity="0.7">z</text>
            <text x="118" y="38" fill="#22cc44" fontSize="11" fontFamily="monospace" opacity="0.5">z</text>
            <text x="128" y="30" fill="#22cc44" fontSize="13" fontFamily="monospace" opacity="0.3">z</text>
            <text x="80" y="138" textAnchor="middle" fill="#204420" fontSize="11" fontFamily="monospace" fontWeight="bold">COMPLETADO</text>
        </svg>
    )
}

function PauseOverlaySVG() {
    return (
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="glow_pause" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#2a2010" />
                    <stop offset="100%" stopColor="#150e00" />
                </radialGradient>
            </defs>
            <circle cx="40" cy="40" r="38" fill="url(#glow_pause)" stroke="#aa6600" strokeWidth="1.5" opacity="0.9" />
            <circle cx="40" cy="40" r="36" fill="none" stroke="#ffaa00" strokeWidth="1" opacity="0.2" />
            <rect x="22" y="22" width="12" height="36" rx="4" fill="#ffaa00" opacity="0.9" />
        </svg>
    )
}

function BotAiWorkingSVG({ compact = false }) {
    if (compact) {
        return (
            <svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <defs>
                    <radialGradient id="cg2" cx="50%" cy="50%" r="45%">
                        <stop offset="0%" stopColor="#1a3aff" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="#0a1040" stopOpacity="0" />
                    </radialGradient>
                    <filter id="tg2" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" />
                    </filter>
                    <clipPath id="b2"><rect width="240" height="150" rx="8" /></clipPath>
                </defs>
                <g clipPath="url(#b2)">
                    <rect width="240" height="150" fill="url(#cg2)" />
                    <ellipse cx="120" cy="75" rx="90" ry="50" fill="none" stroke="#1a2a6a" strokeWidth="0.5" opacity="0.35" />
                    <circle r="2.5" fill="#4488ff" opacity="0.9" filter="url(#tg2)">
                        <animateMotion dur="4s" repeatCount="indefinite" path="M 120,25 A 90,50 0 1,1 119.9,25" />
                    </circle>
                    <ellipse cx="120" cy="75" rx="55" ry="30" fill="none" stroke="#2040aa" strokeWidth="0.5" opacity="0.25" />
                    <circle r="2" fill="#66aaff" opacity="0.8" filter="url(#tg2)">
                        <animateMotion dur="2.5s" repeatCount="indefinite" path="M 120,45 A 55,30 0 1,1 119.9,45" />
                    </circle>
                    <circle cx="120" cy="75" r="25" fill="none" stroke="#2255cc" strokeWidth="1" opacity="0">
                        <animate attributeName="r" values="14;28;14" dur="2.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.45;0;0.45" dur="2.2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="120" cy="75" r="11" fill="#0a1840" stroke="#2244aa" strokeWidth="1" opacity="0.7" />
                    <rect x="112" y="67" width="16" height="16" rx="3" fill="none" stroke="#4488ff" strokeWidth="1">
                        <animate attributeName="stroke-opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
                    </rect>
                    <line x1="115" y1="75" x2="125" y2="75" stroke="#88aaff" strokeWidth="1">
                        <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite" />
                    </line>
                    <line x1="120" y1="70" x2="120" y2="80" stroke="#88aaff" strokeWidth="1">
                        <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" begin="-0.45s" repeatCount="indefinite" />
                    </line>
                    <rect x="67" y="128" width="106" height="18" rx="9" fill="#060c22" stroke="#1a2a6a" strokeWidth="1" opacity="0.88" />
                    <circle cx="78" cy="137" r="3" fill="#22dd55">
                        <animate attributeName="opacity" values="1;0.25;1" dur="1s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="78" cy="137" r="5" fill="none" stroke="#22dd55" strokeWidth="0.8" opacity="0">
                        <animate attributeName="opacity" values="0.35;0;0.35" dur="1s" repeatCount="indefinite" />
                        <animate attributeName="r" values="3;6;3" dur="1s" repeatCount="indefinite" />
                    </circle>
                    <text x="128" y="141" textAnchor="middle" fill="#6688cc" fontSize="8" fontFamily="monospace" letterSpacing="1">IA PROCESANDO</text>
                </g>
            </svg>
        )
    }

    return (
        <svg viewBox="0 0 480 300" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
                <radialGradient id="centerGlow" cx="50%" cy="50%" r="45%">
                    <stop offset="0%" stopColor="#1a3aff" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#0a1040" stopOpacity="0" />
                </radialGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="softglow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="8" />
                </filter>
                <filter id="tinyglow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" />
                </filter>
                <clipPath id="bounds">
                    <rect width="480" height="300" rx="10" />
                </clipPath>
            </defs>
            <g clipPath="url(#bounds)">
                <rect width="480" height="300" fill="url(#centerGlow)" />
                <g transform="translate(240,150)">
                    <ellipse rx="180" ry="100" fill="none" stroke="#1a2a6a" strokeWidth="0.5" opacity="0.4" />
                    <circle r="3" fill="#4488ff" opacity="0.9" filter="url(#tinyglow)">
                        <animateMotion dur="4s" repeatCount="indefinite">
                            <mpath href="#orbit1" />
                        </animateMotion>
                    </circle>
                    <circle r="1.5" fill="#88aaff" opacity="0.6">
                        <animateMotion dur="4s" begin="-2s" repeatCount="indefinite">
                            <mpath href="#orbit1" />
                        </animateMotion>
                    </circle>
                </g>
                <path id="orbit1" d="M 240,50 A 180,100 0 1,1 239.9,50" fill="none" />
                <g transform="translate(240,150)">
                    <ellipse rx="120" ry="65" fill="none" stroke="#2040aa" strokeWidth="0.5" opacity="0.3" />
                    <circle r="2.5" fill="#66aaff" opacity="0.8" filter="url(#tinyglow)">
                        <animateMotion dur="2.8s" repeatCount="indefinite">
                            <mpath href="#orbit2" />
                        </animateMotion>
                    </circle>
                    <circle r="2" fill="#3366cc" opacity="0.7">
                        <animateMotion dur="2.8s" begin="-1.4s" repeatCount="indefinite">
                            <mpath href="#orbit2" />
                        </animateMotion>
                    </circle>
                </g>
                <path id="orbit2" d="M 240,85 A 120,65 0 1,1 239.9,85" fill="none" />
                <g transform="translate(240,150)">
                    <ellipse rx="60" ry="34" fill="none" stroke="#3060cc" strokeWidth="0.5" opacity="0.25" />
                    <circle r="2" fill="#88ccff" opacity="0.95" filter="url(#tinyglow)">
                        <animateMotion dur="1.6s" repeatCount="indefinite">
                            <mpath href="#orbit3" />
                        </animateMotion>
                    </circle>
                </g>
                <path id="orbit3" d="M 240,116 A 60,34 0 1,1 239.9,116" fill="none" />
                <circle cx="240" cy="150" r="50" fill="none" stroke="#2255cc" strokeWidth="1.5" opacity="0">
                    <animate attributeName="r" values="28;55;28" dur="2.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="2.2s" repeatCount="indefinite" />
                </circle>
                <circle cx="240" cy="150" r="40" fill="none" stroke="#3366ff" strokeWidth="1" opacity="0">
                    <animate attributeName="r" values="20;42;20" dur="2.2s" begin="-0.7s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0;0.4" dur="2.2s" begin="-0.7s" repeatCount="indefinite" />
                </circle>
                <circle cx="240" cy="150" r="22" fill="#0a1840" stroke="#2244aa" strokeWidth="1" opacity="0.7" />
                <circle cx="240" cy="150" r="16" fill="#1030a0" opacity="0.5">
                    <animate attributeName="opacity" values="0.5;0.8;0.5" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <g transform="translate(240,150)" opacity="0.9">
                    <rect x="-9" y="-9" width="18" height="18" rx="3" fill="none" stroke="#4488ff" strokeWidth="1.2">
                        <animate attributeName="stroke-opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
                    </rect>
                    <line x1="-9" y1="-5" x2="-13" y2="-5" stroke="#3366cc" strokeWidth="1" opacity="0.7" />
                    <line x1="-9" y1="0" x2="-13" y2="0" stroke="#3366cc" strokeWidth="1" opacity="0.7" />
                    <line x1="-9" y1="5" x2="-13" y2="5" stroke="#3366cc" strokeWidth="1" opacity="0.7" />
                    <line x1="9" y1="-5" x2="13" y2="-5" stroke="#3366cc" strokeWidth="1" opacity="0.7" />
                    <line x1="9" y1="0" x2="13" y2="0" stroke="#3366cc" strokeWidth="1" opacity="0.7" />
                    <line x1="9" y1="5" x2="13" y2="5" stroke="#3366cc" strokeWidth="1" opacity="0.7" />
                    <line x1="-5" y1="0" x2="5" y2="0" stroke="#88aaff" strokeWidth="1">
                        <animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite" />
                    </line>
                    <line x1="0" y1="-5" x2="0" y2="5" stroke="#88aaff" strokeWidth="1">
                        <animate attributeName="opacity" values="1;0.3;1" dur="0.9s" begin="-0.45s" repeatCount="indefinite" />
                    </line>
                </g>
                <circle cx="80" cy="60" r="1.5" fill="#3355aa" opacity="0.6">
                    <animate attributeName="cy" values="60;50;60" dur="3.1s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.2;0.6" dur="3.1s" repeatCount="indefinite" />
                </circle>
                <circle cx="400" cy="80" r="1" fill="#4466bb" opacity="0.5">
                    <animate attributeName="cy" values="80;68;80" dur="2.7s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2.7s" repeatCount="indefinite" />
                </circle>
                <circle cx="130" cy="220" r="1.5" fill="#2244aa" opacity="0.4">
                    <animate attributeName="cy" values="220;210;220" dur="3.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3.5s" repeatCount="indefinite" />
                </circle>
                <circle cx="360" cy="230" r="1" fill="#3355bb" opacity="0.5">
                    <animate attributeName="cy" values="230;218;230" dur="2.9s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2.9s" repeatCount="indefinite" />
                </circle>
                <circle cx="60" cy="160" r="1" fill="#2244aa" opacity="0.3">
                    <animate attributeName="cx" values="60;50;60" dur="4s" repeatCount="indefinite" />
                </circle>
                <circle cx="430" cy="140" r="1.5" fill="#3366cc" opacity="0.4">
                    <animate attributeName="cx" values="430;442;430" dur="3.3s" repeatCount="indefinite" />
                </circle>
                <rect x="170" y="256" width="140" height="26" rx="13" fill="#060c22" stroke="#1a2a6a" strokeWidth="1" opacity="0.88" />
                <circle cx="191" cy="269" r="4" fill="#22dd55">
                    <animate attributeName="opacity" values="1;0.25;1" dur="1s" repeatCount="indefinite" />
                    <animate attributeName="r" values="4;3;4" dur="1s" repeatCount="indefinite" />
                </circle>
                <circle cx="191" cy="269" r="7" fill="none" stroke="#22dd55" strokeWidth="0.8" opacity="0">
                    <animate attributeName="opacity" values="0.4;0;0.4" dur="1s" repeatCount="indefinite" />
                    <animate attributeName="r" values="4;9;4" dur="1s" repeatCount="indefinite" />
                </circle>
                <text x="256" y="274" textAnchor="middle" fill="#6688cc" fontSize="10" fontFamily="monospace" letterSpacing="1.5">IA PROCESANDO</text>
                <text x="8" y="20" fill="#0d1a3a" fontSize="7" fontFamily="monospace" opacity="0.6">
                    01101 10010
                    <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
                </text>
                <text x="8" y="290" fill="#0d1a3a" fontSize="7" fontFamily="monospace" opacity="0.5">
                    11001 01110
                    <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2.4s" repeatCount="indefinite" />
                </text>
                <text x="380" y="20" fill="#0d1a3a" fontSize="7" fontFamily="monospace" opacity="0.4">
                    10110
                    <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.8s" repeatCount="indefinite" />
                </text>
            </g>
        </svg>
    )
}

/* ══════════════════════════════════════════════════════════════
   BotStream Component
   ══════════════════════════════════════════════════════════════ */

const SIZE_KEY = 'botstream_size'

function getSavedSize() {
    try {
        const saved = sessionStorage.getItem(SIZE_KEY)
        if (saved) return JSON.parse(saved)
    } catch { }
    return null
}

export default function BotStream() {
    const { status, aiProcessing } = useBot()
    const [position, setPosition] = useState({ x: window.innerWidth - 340, y: 80 })
    const [isDragging, setIsDragging] = useState(false)
    const [viewMode, setViewMode] = useState('normal') // 'minimized' | 'normal' | 'expanded'
    const [currentSrc, setCurrentSrc] = useState('')
    const [panelSize, setPanelSize] = useState(getSavedSize() || { width: 320, height: 240 })
    const dragRef = useRef(null)
    const offsetRef = useRef({ x: 0, y: 0 })
    const containerRef = useRef(null)
    const isResizingRef = useRef(false)
    const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 })

    const botStatus = status?.status || 'idle'
    const isRunning = botStatus === 'running' || botStatus === 'paused' || botStatus === 'paused_user'
    const isPaused = botStatus === 'paused' || botStatus === 'paused_user'
    const prevRunningRef = useRef(false)

    // Clear stale screenshot when bot starts (transition: not running -> running)
    useEffect(() => {
        if (isRunning && !prevRunningRef.current) {
            setCurrentSrc('') // Force loading SVG until first fresh frame arrives
        }
        prevRunningRef.current = isRunning
    }, [isRunning])

    // Persist size to sessionStorage
    useEffect(() => {
        sessionStorage.setItem(SIZE_KEY, JSON.stringify(panelSize))
    }, [panelSize])

    // Preload-based recursive polling for screenshots
    useEffect(() => {
        if (!isRunning) {
            return
        }
        let cancelled = false
        let timeoutId = null

        const loadNextFrame = () => {
            if (cancelled) return
            const img = new Image()
            img.onload = () => {
                if (!cancelled) {
                    setCurrentSrc(img.src)
                    timeoutId = setTimeout(loadNextFrame, 1000)
                }
            }
            img.onerror = () => {
                if (!cancelled) {
                    timeoutId = setTimeout(loadNextFrame, 1000)
                }
            }
            img.src = `${API}/bot/screen?t=${Date.now()}`
        }
        loadNextFrame()

        return () => {
            cancelled = true
            if (timeoutId) clearTimeout(timeoutId)
        }
    }, [isRunning])

    // Drag handlers (header)
    const handlePointerDown = (e) => {
        if (viewMode === 'expanded' || isResizingRef.current) return
        e.preventDefault()
        e.target.setPointerCapture(e.pointerId)
        setIsDragging(true)
        offsetRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        }
    }

    const handlePointerMove = (e) => {
        if (!isDragging) return
        const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - offsetRef.current.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - offsetRef.current.y))
        setPosition({ x: newX, y: newY })
    }

    const handlePointerUp = (e) => {
        setIsDragging(false)
        e.target.releasePointerCapture(e.pointerId)
    }

    // Resize handlers (corner grip)
    const handleResizeDown = (e) => {
        e.preventDefault()
        e.stopPropagation()
        isResizingRef.current = true
        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            w: panelSize.width,
            h: panelSize.height,
        }

        const onMove = (ev) => {
            const dx = ev.clientX - resizeStartRef.current.x
            const dy = ev.clientY - resizeStartRef.current.y
            const maxW = Math.min(window.innerWidth - position.x - 20, window.innerWidth - 40)
            const maxH = Math.min(window.innerHeight - position.y - 20, window.innerHeight - 40)
            const newW = Math.max(240, Math.min(maxW, resizeStartRef.current.w + dx))
            const newH = Math.max(180, Math.min(maxH, resizeStartRef.current.h + dy))
            setPanelSize({ width: newW, height: newH })
        }

        const onUp = () => {
            isResizingRef.current = false
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', onUp)
        }

        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
    }

    const cycleView = useCallback(() => {
        setViewMode(prev => {
            if (prev === 'minimized') return 'normal'
            if (prev === 'normal') return 'expanded'
            return 'normal'
        })
    }, [])

    const toggleMinimize = useCallback(() => {
        setViewMode(prev => prev === 'minimized' ? 'normal' : 'minimized')
    }, [])

    // Determine which SVG to show when not streaming
    const renderIdleSVG = () => {
        if (botStatus === 'running' && !currentSrc) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                    <BotLoadingSVG />
                </div>
            )
        }
        if (botStatus === 'idle' || botStatus === 'error' || botStatus === 'disconnected' || botStatus === 'stopping') {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                    <BotOfflineSVG />
                </div>
            )
        }
        // For completed/stopped sessions that went back to idle
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                <BotOfflineSVG />
            </div>
        )
    }

    const isExpanded = viewMode === 'expanded'
    const isMinimized = viewMode === 'minimized'

    const containerStyle = isExpanded ? {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10000,
        width: '90vw',
        maxWidth: '1400px',
        height: '88vh',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'none',
    } : {
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999,
        width: isMinimized ? '200px' : `${panelSize.width}px`,
        height: isMinimized ? 'auto' : `${panelSize.height}px`,
        minWidth: isMinimized ? undefined : '240px',
        minHeight: isMinimized ? undefined : '180px',
        maxWidth: `calc(100vw - 40px)`,
        maxHeight: `calc(100vh - 40px)`,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'width 0.2s ease, height 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
    }

    // Header indicator color
    const indicatorColor = isRunning
        ? isPaused ? '#ffaa00' : 'var(--success)'
        : 'var(--text-muted)'
    const indicatorAnim = isRunning && !isPaused ? 'pulse 2s infinite' : 'none'

    return (
        <>
            {/* Backdrop for expanded mode */}
            {isExpanded && (
                <div
                    onClick={() => setViewMode('normal')}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 9999,
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(4px)',
                    }}
                />
            )}

            <div ref={containerRef} style={containerStyle}>
                {/* Header (Draggable in normal/minimized) */}
                <div
                    ref={dragRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{
                        padding: isExpanded ? '10px 16px' : '8px 12px',
                        background: 'var(--bg-hover)',
                        borderBottom: '1px solid var(--border)',
                        cursor: isExpanded ? 'default' : (isDragging ? 'grabbing' : 'grab'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        userSelect: 'none',
                        touchAction: 'none',
                        flexShrink: 0,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: indicatorColor, animation: indicatorAnim }} />
                        <span style={{ fontSize: isExpanded ? '14px' : '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Vista del Bot</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {/* Minimize button */}
                        <button
                            onClick={toggleMinimize}
                            title={isMinimized ? 'Restaurar' : 'Minimizar'}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', outline: 'none', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                {isMinimized ? (
                                    <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" strokeLinecap="round" strokeLinejoin="round" />
                                ) : (
                                    <path d="M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                                )}
                            </svg>
                        </button>
                        {/* Expand/Collapse */}
                        {!isMinimized && (
                            <button
                                onClick={cycleView}
                                title={isExpanded ? 'Reducir' : 'Pantalla completa'}
                                style={{ background: 'transparent', border: 'none', color: isExpanded ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', outline: 'none', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    {isExpanded ? (
                                        <path d="M4 14h6v6m10-10h-6V4M10 14L4 20M20 4l-6 6" strokeLinecap="round" strokeLinejoin="round" />
                                    ) : (
                                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                                    )}
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Content (Stream / SVG state / Pause overlay) */}
                {!isMinimized && (
                    <div style={{
                        position: 'relative',
                        flex: 1,
                        background: '#0a0a14',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        overflow: 'hidden',
                    }}>
                        {/* Main content: stream or SVG state */}
                        {isRunning && currentSrc ? (
                            <img
                                src={currentSrc}
                                alt="Bot screen stream"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    display: 'block',
                                }}
                            />
                        ) : isRunning && !currentSrc ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                                <BotLoadingSVG />
                            </div>
                        ) : (
                            renderIdleSVG()
                        )}

                        {/* AI Processing Overlay */}
                        {aiProcessing && currentSrc && !isPaused && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                zIndex: 1,
                            }}>
                                <BotAiWorkingSVG compact={isMinimized || (panelSize.width < 400 && !isExpanded)} />
                            </div>
                        )}

                        {/* Pause overlay */}
                        {isPaused && currentSrc && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0,0,0,0.55)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                zIndex: 2,
                            }}>
                                <PauseOverlaySVG />
                                <span style={{ color: '#ffaa00', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '2px' }}>PAUSADO</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Resize grip (bottom-right corner, only in normal mode) */}
                {!isMinimized && !isExpanded && (
                    <div
                        onPointerDown={handleResizeDown}
                        style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 0,
                            width: '20px',
                            height: '20px',
                            cursor: 'nwse-resize',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                        </svg>
                    </div>
                )}
            </div>
        </>
    )
}
