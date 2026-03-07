import React, { useEffect, useState, useRef } from 'react'

export default function BotCooldownSVG({ totalSeconds = 11 }) {
    const arcRef = useRef(null)
    const dotAnimRef = useRef(null)
    const [remaining, setRemaining] = useState(totalSeconds)

    useEffect(() => {
        setRemaining(totalSeconds)
        const circumference = 2 * Math.PI * 68 // ~427.25

        if (dotAnimRef.current) {
            dotAnimRef.current.setAttribute('dur', `${totalSeconds}s`)
            try {
                dotAnimRef.current.beginElement()
            } catch (e) {
                // Ignore JS DOM constraint exceptions
            }
        }

        if (arcRef.current) {
            arcRef.current.style.strokeDashoffset = '0'
        }

        const interval = setInterval(() => {
            setRemaining((prev) => {
                const next = prev - 1
                if (next <= 0) {
                    clearInterval(interval)
                    if (arcRef.current) {
                        arcRef.current.style.strokeDashoffset = circumference
                    }
                    return 0
                }

                if (arcRef.current) {
                    const consumed = (totalSeconds - next) / totalSeconds
                    arcRef.current.style.strokeDashoffset = consumed * circumference
                }
                return next
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [totalSeconds])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <svg
                className="bot-cooldown"
                width="160" height="160" viewBox="0 0 160 160"
                fill="none" xmlns="http://www.w3.org/2000/svg"
            >
                <style>{`
                    .bot-cooldown { animation: cooldown-breathe 4s ease-in-out infinite; }
                    @keyframes cooldown-breathe {
                        0%, 100% { transform: scale(1) translateY(0); }
                        50%      { transform: scale(1.015) translateY(-2px); }
                    }
                    .antenna-glow { animation: ant-blink 2s ease-in-out infinite; }
                    @keyframes ant-blink {
                        0%, 100% { opacity: 1; filter: drop-shadow(0 0 4px #00eeff); }
                        50%      { opacity: 0.3; filter: none; }
                    }
                    .eye-clock {
                        animation: clock-tick 1s steps(12) infinite;
                        transform-origin: 94px 56px;
                    }
                    @keyframes clock-tick {
                        from { transform: rotate(0deg); }
                        to   { transform: rotate(360deg); }
                    }
                    .outer-pulse { animation: outer-ring-pulse 2s ease-in-out infinite; }
                    @keyframes outer-ring-pulse {
                        0%, 100% { opacity: 0.2; stroke-width: 1.5; }
                        50%      { opacity: 0.5; stroke-width: 2.5; }
                    }
                    .rest-bar-1 { animation: rest-bar 2s ease-in-out infinite 0s; }
                    .rest-bar-2 { animation: rest-bar 2s ease-in-out infinite 0.4s; }
                    .rest-bar-3 { animation: rest-bar 2s ease-in-out infinite 0.8s; }
                    .rest-bar-4 { animation: rest-bar 2s ease-in-out infinite 1.2s; }
                    @keyframes rest-bar {
                        0%, 100% { transform: scaleY(0.3); opacity: 0.4; }
                        50%      { transform: scaleY(1); opacity: 0.9; }
                    }
                `}</style>
                <defs>
                    <radialGradient id="bg_cd" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#0a2025" />
                        <stop offset="100%" stopColor="#050d10" />
                    </radialGradient>
                    <radialGradient id="eye_cd_l" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#44ffee" />
                        <stop offset="100%" stopColor="#007788" />
                    </radialGradient>
                    <radialGradient id="eye_cd_r" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#22ddcc" />
                        <stop offset="100%" stopColor="#006070" />
                    </radialGradient>
                    <filter id="glow_teal" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="glow_teal_soft" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="1.8" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <linearGradient id="arc_grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#00eeff" />
                        <stop offset="100%" stopColor="#007799" stopOpacity="0.3" />
                    </linearGradient>
                </defs>

                <circle cx="80" cy="80" r="75" fill="url(#bg_cd)" stroke="#0a3040" strokeWidth="1.5" />

                <circle className="outer-pulse" cx="80" cy="80" r="72" fill="none"
                    stroke="#00ccdd" strokeWidth="1.5" strokeDasharray="10 16"
                    strokeLinecap="round" />

                <circle ref={arcRef} cx="80" cy="80" r="68" fill="none"
                    stroke="url(#arc_grad)" strokeWidth="4"
                    strokeDasharray="427 427"
                    strokeDashoffset="0"
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                    opacity="0.85"
                    style={{ transition: 'stroke-dashoffset 1s linear' }} />

                <g opacity="0.3">
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => (
                        <line key={deg} x1="80" y1="10" x2="80" y2="16" stroke="#00ccdd" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${deg} 80 80)`} />
                    ))}
                </g>

                <circle cx="80" cy="12" r="3.5" fill="#00eeff" filter="url(#glow_teal)">
                    <animateTransform ref={dotAnimRef} attributeName="transform" type="rotate"
                        from="0 80 80" to="-360 80 80"
                        dur={`${totalSeconds}s`} repeatCount="1" fill="freeze" />
                    <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
                </circle>

                <rect x="44" y="68" width="72" height="52" rx="10" fill="#091820" stroke="#0e4055" strokeWidth="1.5" />
                <rect x="52" y="38" width="56" height="38" rx="9" fill="#091820" stroke="#0e4055" strokeWidth="1.5" />

                <line x1="80" y1="38" x2="80" y2="26" stroke="#00ccdd" strokeWidth="2" strokeLinecap="round" />
                <circle className="antenna-glow" cx="80" cy="23" r="4.5"
                    fill="#006677" stroke="#00eeff" strokeWidth="1"
                    filter="url(#glow_teal)" />

                <circle cx="66" cy="56" r="7.5" fill="url(#eye_cd_l)" filter="url(#glow_teal_soft)" opacity="0.7" />
                <rect x="59" y="52" width="14" height="5" rx="2.5" fill="#091820" opacity="0.6" />

                <circle cx="94" cy="56" r="7.5" fill="url(#eye_cd_r)" filter="url(#glow_teal_soft)" opacity="0.9" />
                <g className="eye-clock">
                    <line x1="94" y1="56" x2="94" y2="51" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
                    <line x1="94" y1="56" x2="97.5" y2="57.5" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
                </g>
                <circle cx="94" cy="56" r="1.5" fill="#fff" opacity="0.9" />

                <path d="M 69 72 Q 80 76 91 72" stroke="#0a8090" strokeWidth="2" fill="none" strokeLinecap="round" />

                <rect x="54" y="82" width="52" height="26" rx="5" fill="#050d12" stroke="#0a3040" strokeWidth="1" />

                <text x="80" y="101"
                    textAnchor="middle" fill="#00eeff"
                    fontSize="18" fontFamily="monospace" fontWeight="bold"
                    filter="url(#glow_teal_soft)">{remaining}</text>

                <text x="96" y="101" fill="#007799" fontSize="9"
                    fontFamily="monospace" fontWeight="bold">s</text>

                <rect x="26" y="78" width="18" height="9" rx="4.5"
                    fill="#091820" stroke="#0e4055" strokeWidth="1.5"
                    transform="rotate(8 35 82)" />
                <rect x="116" y="78" width="18" height="9" rx="4.5"
                    fill="#091820" stroke="#0e4055" strokeWidth="1.5"
                    transform="rotate(-8 125 82)" />

                <g transform="translate(55, 126)">
                    <rect className="rest-bar-1" x="0" y="0" width="6" height="10" rx="3"
                        fill="#00ccdd" opacity="0.6" style={{ transformOrigin: '3px 10px' }} />
                    <rect className="rest-bar-2" x="10" y="0" width="6" height="10" rx="3"
                        fill="#00ccdd" opacity="0.6" style={{ transformOrigin: '13px 10px' }} />
                    <rect className="rest-bar-3" x="20" y="0" width="6" height="10" rx="3"
                        fill="#00ccdd" opacity="0.6" style={{ transformOrigin: '23px 10px' }} />
                    <rect className="rest-bar-4" x="30" y="0" width="6" height="10" rx="3"
                        fill="#00ccdd" opacity="0.6" style={{ transformOrigin: '33px 10px' }} />
                </g>

                <text x="80" y="148" textAnchor="middle" fill="#0a4a55"
                    fontSize="8.5" fontFamily="monospace" fontWeight="bold"
                    letterSpacing="1.5">COOLDOWN</text>
            </svg>
        </div>
    )
}
