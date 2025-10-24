import { useEffect, useRef, useState } from 'react'

interface SparkPosition {
  x: number
  y: number
  id: number
}

interface ClickSparkProps {
  color?: string
  enabled?: boolean
}

export function ClickSpark({
  color = '#00ffff',
  enabled = true,
}: ClickSparkProps) {
  const [sparks, setSparks] = useState<SparkPosition[]>([])
  const sparkIdRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const handleClick = (e: MouseEvent) => {
      // Check if the click hit an interactive element
      const target = e.target as HTMLElement
      const isInteractive =
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('a') ||
        target.closest('[role="button"]')

      // Only create spark if clicking on non-interactive elements (background)
      if (isInteractive) return

      const sparkId = sparkIdRef.current++
      const newSpark: SparkPosition = {
        x: e.pageX,
        y: e.pageY,
        id: sparkId,
      }

      setSparks(prev => [...prev, newSpark])

      // Remove spark after animation completes
      setTimeout(() => {
        setSparks(prev => prev.filter(spark => spark.id !== sparkId))
      }, 660)
    }

    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [enabled])

  return (
    <>
      {sparks.map(spark => (
        <Spark color={color} key={spark.id} x={spark.x} y={spark.y} />
      ))}
    </>
  )
}

interface SparkProps {
  x: number
  y: number
  color: string
}

function Spark({ x, y, color }: SparkProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const sparks = Array.from(svg.children) as SVGLineElement[]
    const size = parseInt(sparks[0].getAttribute('y1') || '30')
    const offset = size / 2

    const keyframes = (i: number): Keyframe[] => {
      const deg = `calc(${i} * (360deg / ${sparks.length}))`

      return [
        {
          strokeDashoffset: size * 3,
          transform: `rotate(${deg}) translateY(${offset}px)`,
        },
        {
          strokeDashoffset: size,
          transform: `rotate(${deg}) translateY(0)`,
        },
      ]
    }

    const options: KeyframeAnimationOptions = {
      duration: 660,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
      fill: 'forwards',
    }

    sparks.forEach((spark, i) => spark.animate(keyframes(i), options))
  }, [])

  return (
    <div
      className="pointer-events-none fixed"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
      }}
    >
      <svg
        fill="none"
        height="30"
        ref={svgRef}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
        style={{ transform: 'rotate(-20deg)' }}
        viewBox="0 0 100 100"
        width="30"
      >
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            strokeDasharray="30"
            strokeDashoffset="30"
            style={{ transformOrigin: 'center' }}
            x1="50"
            x2="50"
            y1="30"
            y2="4"
          />
        ))}
      </svg>
    </div>
  )
}
