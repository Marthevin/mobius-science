export type LogoMotionFrame = {
  mode: 'gather' | 'hold' | 'release' | 'field'
  progress: number
}

import { MOBIUS_INFINITY_PARTICLES } from '../../../mobius/renderer/infinity-particle-geometry'

export type LogoCanvasMetrics = {
  width: number
  height: number
  dpr: number
}

type LogoDot = {
  x: number
  y: number
  radius: number
}

type Point3D = {
  x: number
  y: number
  z: number
}

export type LogoParticle = {
  targetX: number
  targetY: number
  source: Point3D
  radius: number
  phase: number
  delay: number
  alpha: number
}

const LOGO_DOTS: LogoDot[] = MOBIUS_INFINITY_PARTICLES.map(({ x, y, radiusX, radiusY }) => ({
  x,
  y,
  radius: Math.max(radiusX, radiusY)
}))

const PARTICLES_PER_DOT = 18
const GOLDEN_ANGLE = 2.399963

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value))

const easeInOut = (progress: number): number =>
  progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2

const easeOut = (progress: number): number => 1 - Math.pow(1 - progress, 3)

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const rotate3D = (point: Point3D, yaw: number, pitch: number): Point3D => {
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const x = point.x * cosYaw - point.z * sinYaw
  const z = point.x * sinYaw + point.z * cosYaw

  return {
    x,
    y: point.y * cosPitch - z * sinPitch,
    z: point.y * sinPitch + z * cosPitch
  }
}

export const resolveLogoFrame = (
  time: number,
  duration: number,
  prefersReducedMotion: boolean
): LogoMotionFrame => {
  if (prefersReducedMotion) return { mode: 'hold', progress: 1 }

  const safeDuration = duration > 0 ? duration : 4800
  const elapsed = ((time % safeDuration) + safeDuration) % safeDuration

  if (elapsed < safeDuration * 0.42) {
    return { mode: 'gather', progress: easeInOut(elapsed / (safeDuration * 0.42)) }
  }
  if (elapsed < safeDuration * 0.58) return { mode: 'hold', progress: 1 }
  if (elapsed < safeDuration * 0.86) {
    return {
      mode: 'release',
      progress: 1 - easeInOut((elapsed - safeDuration * 0.58) / (safeDuration * 0.28))
    }
  }

  return {
    mode: 'field',
    progress: easeOut((elapsed - safeDuration * 0.86) / (safeDuration * 0.14)) * 0.02
  }
}

export const createLogoParticles = (
  metrics: LogoCanvasMetrics,
  seed = 0x5c1e4ce
): LogoParticle[] => {
  const random = createRandom(seed)
  const randomBetween = (minimum: number, maximum: number): number =>
    minimum + random() * (maximum - minimum)
  const logoSize = Math.min(metrics.width, metrics.height) * 0.42
  const centerX = metrics.width / 2
  const centerY = metrics.height / 2
  const count = LOGO_DOTS.length * PARTICLES_PER_DOT

  return Array.from({ length: count }, (_, index) => {
    const dot = LOGO_DOTS[index % LOGO_DOTS.length]
    const pointAngle = index * GOLDEN_ANGLE + randomBetween(-0.18, 0.18)
    const pointRadius = Math.sqrt(random()) * dot.radius
    const pointX = dot.x + Math.cos(pointAngle) * pointRadius
    const pointY = dot.y + Math.sin(pointAngle) * pointRadius
    const sphereRadius = Math.min(metrics.width, metrics.height) * randomBetween(0.24, 0.36)
    const longitude = index * GOLDEN_ANGLE + randomBetween(-0.18, 0.18)
    const latitude = Math.asin(randomBetween(-0.92, 0.92))
    const sourceRadius = sphereRadius * Math.pow(randomBetween(0.58, 1), 0.38)

    return {
      targetX: centerX + pointX * logoSize,
      targetY: centerY + pointY * logoSize,
      source: {
        x: Math.cos(latitude) * Math.cos(longitude) * sourceRadius,
        y: Math.sin(latitude) * sourceRadius * 0.92,
        z: Math.cos(latitude) * Math.sin(longitude) * sourceRadius
      },
      radius: randomBetween(0.68, 1.28) * metrics.dpr,
      phase: randomBetween(0, Math.PI * 2),
      delay: randomBetween(-0.035, 0.05),
      alpha: randomBetween(0.5, 1)
    }
  })
}

const drawResolvedLogo = (
  context: CanvasRenderingContext2D,
  metrics: LogoCanvasMetrics,
  color: string,
  strength: number,
  time: number
): void => {
  if (strength <= 0) return

  const logoSize = Math.min(metrics.width, metrics.height) * 0.42
  const centerX = metrics.width / 2
  const centerY = metrics.height / 2
  const rotation = time * 0.00028
  const breath = 1 + Math.sin(time * 0.0026) * 0.018
  const cosRotation = Math.cos(rotation)
  const sinRotation = Math.sin(rotation)

  context.fillStyle = color
  context.globalAlpha = 0.94 * strength

  for (const dot of LOGO_DOTS) {
    const dotX = dot.x * logoSize * breath
    const dotY = dot.y * logoSize * breath
    const x = centerX + dotX * cosRotation - dotY * sinRotation
    const y = centerY + dotX * sinRotation + dotY * cosRotation

    context.beginPath()
    context.arc(
      x,
      y,
      Math.max(0.8 * metrics.dpr, dot.radius * logoSize * 0.9 * breath),
      0,
      Math.PI * 2
    )
    context.fill()
  }
}

export const drawOpenScienceLogoFrame = (
  context: CanvasRenderingContext2D,
  particles: readonly LogoParticle[],
  metrics: LogoCanvasMetrics,
  color: string,
  frame: LogoMotionFrame,
  time: number
): void => {
  context.clearRect(0, 0, metrics.width, metrics.height)
  context.save()
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = color

  const resolvedStrength = frame.mode === 'hold' ? 1 : clamp((frame.progress - 0.94) / 0.06, 0, 1)
  const particleFade = 1 - resolvedStrength
  const centerX = metrics.width / 2
  const centerY = metrics.height / 2
  const minimumDimension = Math.min(metrics.width, metrics.height)

  for (const particle of particles) {
    const localProgress = clamp(frame.progress + particle.delay, 0, 1)
    const travel = Math.sin(localProgress * Math.PI)
    const settle = Math.pow(localProgress, 3)
    const micro = (1 - settle) * 0.82 * metrics.dpr
    const yaw = time * 0.00034 + particle.phase * 0.03
    const pitch = Math.sin(time * 0.00022 + particle.phase) * 0.16
    const rotated = rotate3D(particle.source, yaw, pitch)
    const perspective = 1 + rotated.z / (minimumDimension * 1.6)
    const depth = clamp((rotated.z / (minimumDimension * 0.36) + 1) / 2, 0, 1)
    const sourceX = centerX + rotated.x * perspective
    const sourceY = centerY + rotated.y * perspective
    const curveX =
      Math.cos(particle.phase + time * 0.0011) * travel * (1 - settle) * 8 * metrics.dpr
    const curveY =
      Math.sin(particle.phase + time * 0.0013) * travel * (1 - settle) * 5.5 * metrics.dpr
    const x =
      sourceX +
      (particle.targetX - sourceX) * localProgress +
      curveX +
      Math.cos(particle.phase + time * 0.0022) * micro
    const y =
      sourceY +
      (particle.targetY - sourceY) * localProgress +
      curveY +
      Math.sin(particle.phase + time * 0.002) * micro
    const depthScale = 0.68 + depth * 0.74
    const radius = particle.radius * depthScale * (0.84 + localProgress * 0.1)
    const opacity = (0.22 + depth * 0.56 + localProgress * 0.16) * particle.alpha * particleFade

    if (opacity < 0.01) continue

    context.globalAlpha = opacity
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }

  drawResolvedLogo(context, metrics, color, resolvedStrength, time)
  context.restore()
}
