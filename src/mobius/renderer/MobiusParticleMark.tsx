import type { ComponentPropsWithoutRef, JSX } from 'react'

import { MOBIUS_INFINITY_PARTICLES } from './infinity-particle-geometry'

type MobiusParticleMarkProps = Omit<ComponentPropsWithoutRef<'svg'>, 'children' | 'viewBox'>

export const MobiusParticleMark = ({
  className,
  ...props
}: MobiusParticleMarkProps): JSX.Element => (
  <svg
    {...props}
    data-mobius-particle-mark="true"
    className={className}
    viewBox="-0.52 -0.36 1.04 0.72"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    focusable="false"
    aria-hidden="true"
  >
    {MOBIUS_INFINITY_PARTICLES.map((particle, index) => (
      <ellipse
        key={index}
        cx={particle.x}
        cy={particle.y}
        rx={particle.radiusX}
        ry={particle.radiusY}
        opacity={particle.opacity}
        transform={`rotate(${particle.rotation} ${particle.x} ${particle.y})`}
      />
    ))}
  </svg>
)
