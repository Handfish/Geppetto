import { useId } from 'react'

export default function SleepLight({ color = '#ffffff', speed = 10 }) {
  const id = useId()
  const barGradId = `barGrad-${id}`
  const coronaGradId = `coronaGrad-${id}`
  const glowId = `glow-${id}`

  return (
    <>
      <style>{`
        @keyframes breathe-${id} {
          0%   { opacity: 0; transform: scaleX(0.92); }
          5%  { opacity: 0; transform: scaleX(0.92); }
          50%  { opacity: 1.0; transform: scaleX(1.08); }
          95%  { opacity: 0; transform: scaleX(0.92); }
          100% { opacity: 0; transform: scaleX(0.92); }
        }
        .animate-breathe-${id} {
          animation: breathe-${id} ${speed}s ease-in-out infinite;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-breathe-${id} {
            animation: none !important;
            opacity: 0.7;
          }
        }
      `}</style>
      <svg
        aria-label="Sleep Light"
        className="w-[300px] h-10"
        role="img"
        viewBox="0 0 300 40"
      >
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={barGradId}
            x1="0"
            x2="300"
            y1="20"
            y2="20"
          >
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="20%" stopColor={color} stopOpacity="0.6" />
            <stop offset="50%" stopColor={color} stopOpacity="1" />
            <stop offset="80%" stopColor={color} stopOpacity="0.6" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>

          <radialGradient cx="50%" cy="50%" id={coronaGradId} r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="50%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>

          <filter height="400%" id={glowId} width="400%" x="-150%" y="-150%">
            <feGaussianBlur result="blur" stdDeviation="10" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          className={`animate-breathe-${id}`}
          fill={`url(#${coronaGradId})`}
          filter={`url(#${glowId})`}
          height="40"
          rx="20"
          width="300"
          x="0"
          y="0"
        />

        <rect
          className={`animate-breathe-${id}`}
          fill={`url(#${barGradId})`}
          height="20"
          rx="10"
          width="300"
          x="0"
          y="0"
        />
      </svg>
    </>
  )
}
