export type MobiusInfinityParticle = Readonly<{
  x: number
  y: number
  radiusX: number
  radiusY: number
  rotation: number
  opacity: number
}>

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value))

const createGeometry = (): readonly MobiusInfinityParticle[] => {
  const random = createRandom(0x4d4f4249)
  const gaussian = (): number => {
    const u = Math.max(random(), 0.000001)
    const v = random()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  return Object.freeze(
    Array.from({ length: 72 }, () => {
      const t = random() * Math.PI * 2
      const width = 0.42
      const height = 0.23
      const centerX = width * Math.sin(t)
      const centerY = height * Math.sin(2 * t)
      const dx = width * Math.cos(t)
      const dy = 2 * height * Math.cos(2 * t)
      const tangentLength = Math.hypot(dx, dy)
      const tangentX = dx / tangentLength
      const tangentY = dy / tangentLength
      const normalX = -tangentY
      const normalY = tangentX
      const normalOffset = clamp(gaussian() * 0.052, -0.092, 0.092)
      const tangentOffset = (random() - 0.5) * 0.024
      const radius = 0.006 + random() ** 1.65 * 0.017

      return Object.freeze({
        x: centerX + normalX * normalOffset + tangentX * tangentOffset,
        y: centerY + normalY * normalOffset + tangentY * tangentOffset,
        radiusX: radius * (0.76 + random() * 0.48),
        radiusY: radius * (0.76 + random() * 0.48),
        rotation: -35 + random() * 70,
        opacity: 0.48 + random() * 0.48
      })
    })
  )
}

export const MOBIUS_INFINITY_PARTICLES = createGeometry()
