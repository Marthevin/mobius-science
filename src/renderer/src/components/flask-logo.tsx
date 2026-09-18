import { MobiusParticleMark } from '../../../mobius/renderer/MobiusParticleMark'

type FlaskLogoProps = {
  className?: string
}

// Compatibility wrapper for established neutral surfaces. The brand geometry is downstream-owned
// under src/mobius; existing notice and empty-state call sites keep their current layout contract.
const FlaskLogo = ({ className }: FlaskLogoProps): React.JSX.Element => (
  <MobiusParticleMark className={className} />
)

export { FlaskLogo }
