import * as React from 'react'

import { MOBIUS_INFINITY_PARTICLES } from './infinity-particle-geometry'

export type MobiusScenarioIconId = 'subagent' | 'reviewer' | 'vision' | 'session-details'

// One intentionally irregular point cloud resolves into an infinity silhouette at UI size. The
// uneven sizes and offsets keep the family organic while the fixed geometry keeps every scene
// icon aligned. A small gap at the crossover preserves room for each scene's functional core.
const infinityCloud = MOBIUS_INFINITY_PARTICLES.filter(
  (particle) => Math.hypot(particle.x * 1.2, particle.y) > 0.11
)
  .filter((_, index) => index % 2 === 0)
  .map((particle) => ({
    x: 12 + particle.x * 22,
    y: 12 + particle.y * 22,
    radiusX: Math.max(0.2, particle.radiusX * 25),
    radiusY: Math.max(0.2, particle.radiusY * 25),
    rotation: particle.rotation,
    opacity: 0.44 + particle.opacity * 0.42
  }))

const InfinityCloud = (): React.JSX.Element => (
  <g data-icon-layer="infinity-cloud" fill="currentColor">
    {infinityCloud.map(({ x, y, radiusX, radiusY, rotation, opacity }, index) => (
      <ellipse
        key={index}
        cx={x}
        cy={y}
        rx={radiusX}
        ry={radiusY}
        opacity={opacity}
        transform={`rotate(${rotation} ${x} ${y})`}
      />
    ))}
  </g>
)

const SubagentCore = (): React.JSX.Element => (
  <g data-icon-layer="scene-core" fill="currentColor" stroke="currentColor" strokeWidth="0.85">
    <path d="M10.15 12h3.25M12.95 12l2.15-2.2M12.95 12l2.15 2.2" fill="none" />
    <circle cx="9.35" cy="12" r="1.3" stroke="none" />
    <circle cx="15.75" cy="9.2" r="0.9" stroke="none" />
    <circle cx="15.75" cy="12" r="0.9" stroke="none" />
    <circle cx="15.75" cy="14.8" r="0.9" stroke="none" />
  </g>
)

const ReviewerCore = (): React.JSX.Element => (
  <g
    data-icon-layer="scene-core"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11.35" cy="11.35" r="3.15" strokeWidth="1.35" />
    <path d="m9.7 11.35 1.15 1.15 2.25-2.3" strokeWidth="1.4" />
    <path d="m13.7 13.7 2.45 2.45" strokeWidth="1.55" />
  </g>
)

const VisionCore = (): React.JSX.Element => (
  <g
    data-icon-layer="scene-core"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path
      d="M7.65 12s1.65-3 4.35-3 4.35 3 4.35 3-1.65 3-4.35 3-4.35-3-4.35-3Z"
      strokeWidth="1.25"
    />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12.55" cy="11.45" r="0.42" fill="white" stroke="none" opacity="0.72" />
  </g>
)

const SessionDetailsCore = (): React.JSX.Element => (
  <g
    data-icon-layer="scene-core"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="8.3" y="8.1" width="7.4" height="7.8" rx="1.5" strokeWidth="1.2" />
    <circle cx="10.25" cy="10.6" r="0.55" fill="currentColor" stroke="none" />
    <circle cx="10.25" cy="13.4" r="0.55" fill="currentColor" stroke="none" />
    <path d="M12.15 10.6h1.75M12.15 13.4h1.75" strokeWidth="1.15" />
  </g>
)

const scenarioCores: Readonly<Record<MobiusScenarioIconId, () => React.JSX.Element>> =
  Object.freeze({
    subagent: SubagentCore,
    reviewer: ReviewerCore,
    vision: VisionCore,
    'session-details': SessionDetailsCore
  })

export const MobiusScenarioIcon = ({
  id,
  className
}: Readonly<{
  id: MobiusScenarioIconId
  className?: string
}>): React.JSX.Element => {
  const Core = scenarioCores[id]
  return (
    <svg
      data-scenario-icon={id}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      aria-hidden="true"
    >
      <InfinityCloud />
      <Core />
    </svg>
  )
}
