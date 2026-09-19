import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const generatedRoot = join(root, 'mobius', 'generated')

const pixelAt = async (path: string, x: number, y: number): Promise<number[]> => {
  const { data } = await sharp(path)
    .ensureAlpha()
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return [...data]
}

const brightParticlePixelCount = async (path: string): Promise<number> => {
  const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] > 240 && data[offset] + data[offset + 1] + data[offset + 2] > 480) {
      count += 1
    }
  }
  return count
}

describe('Mobius Science approved brand assets', () => {
  it('builds the menu-bar infinity from irregular particles without a drawn line', async () => {
    const tray = await readFile(join(root, 'mobius', 'brand', 'mobius-science-tray.svg'), 'utf8')
    const radii = [...tray.matchAll(/\br="([\d.]+)"/g)].map((match) => match[1])

    expect(tray).toContain('data-tray-layer="infinity-particles"')
    expect(tray).not.toMatch(/<(?:path|polyline|line)\b/)
    expect(tray).not.toContain('stroke=')
    expect(tray.match(/<circle\b/g)?.length ?? 0).toBeGreaterThanOrEqual(24)
    expect(new Set(radii).size).toBeGreaterThanOrEqual(5)
  })

  it('builds the infinity silhouette from a wide irregular particle field', async () => {
    const icon = await readFile(join(root, 'mobius', 'brand', 'mobius-science-icon.svg'), 'utf8')

    expect(icon).toContain('data-icon-layer="star-field"')
    expect(icon).toContain('data-icon-layer="infinity-cloud"')
    expect(icon.match(/<ellipse\b/g)?.length ?? 0).toBeGreaterThan(200)
    expect(icon.match(/<circle\b/g)?.length ?? 0).toBeGreaterThan(100)
    expect(icon).toContain('<linearGradient')
    expect(icon).toContain('<radialGradient')
  })

  it('masks the cosmic field to the original rounded tile silhouette', async () => {
    const iconPath = join(generatedRoot, 'app', 'icon.png')
    expect(await pixelAt(iconPath, 0, 0)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(iconPath, 80, 512)).toEqual([0, 0, 0, 0])
    const upperInterior = await pixelAt(iconPath, 512, 128)
    expect(upperInterior[3]).toBe(255)
    expect(upperInterior[2]).toBeGreaterThan(upperInterior[0] + 20)
    expect(await brightParticlePixelCount(iconPath)).toBeGreaterThan(5_000)
  })

  it('keeps one cosmic identity in light and dark application chrome', async () => {
    const [light, dark] = await Promise.all([
      readFile(join(generatedRoot, 'app', 'icon.png')),
      readFile(join(generatedRoot, 'app', 'icon-dark.png'))
    ])
    expect(dark.equals(light)).toBe(true)
  })

  it('writes the DMG background at Finder logical-pixel density', async () => {
    const metadata = await sharp(join(generatedRoot, 'app', 'dmg-background.png')).metadata()
    expect(metadata).toMatchObject({ width: 660, height: 534, density: 72 })
  })

  it('places the application icon in the DMG header', async () => {
    const center = await pixelAt(join(generatedRoot, 'app', 'dmg-background.png'), 204, 50)
    expect(center[0] + center[1] + center[2]).toBeLessThan(550)
    expect(center[2]).toBeGreaterThan(center[0] + 40)
    expect(center[3]).toBe(255)
  })

  it.each([
    ['app/dmg-background.png', 660, 534],
    ['app/icon-512.png', 512],
    ['app/icon.png', 1024],
    ['app/icon-dark.png', 1024],
    ['renderer/logo.png', 512],
    ['renderer/logo-dark.png', 512],
    ['tray/tray.png', 24],
    ['tray/tray@2x.png', 48],
    ['tray/trayTemplate.png', 16],
    ['tray/trayTemplate@2x.png', 32]
  ] as const)('generates %s at %d×%d px', async (relativePath, width, height = width) => {
    const metadata = await sharp(join(generatedRoot, relativePath)).metadata()
    expect(metadata).toMatchObject({ width, height, format: 'png', hasAlpha: true })
  })

  it('keeps the full-color cosmic artwork in the macOS Icon Composer package', async () => {
    const descriptor = JSON.parse(
      await readFile(join(generatedRoot, 'app', 'icon.icon', 'icon.json'), 'utf8')
    ) as {
      'fill-specializations'?: unknown[]
      groups?: Array<{
        layers?: Array<{
          'image-name'?: string
          'fill-specializations'?: unknown[]
          position?: { scale?: number }
        }>
        shadow?: unknown
        translucency?: unknown
      }>
    }

    expect(descriptor.groups?.[0]?.layers?.[0]?.['image-name']).toBe('mobius-science-icon.svg')
    expect(descriptor['fill-specializations']).toHaveLength(2)
    expect(descriptor.groups?.[0]?.layers?.[0]?.['fill-specializations']).toBeUndefined()
    expect(descriptor.groups?.[0]?.layers?.[0]?.position?.scale).toBe(1)
    expect(descriptor.groups?.[0]?.shadow).toBeTruthy()
    expect(descriptor.groups?.[0]?.translucency).toBeTruthy()
    expect(
      await readFile(
        join(generatedRoot, 'app', 'icon.icon', 'Assets', 'mobius-science-icon.svg'),
        'utf8'
      )
    ).toContain('data-icon-layer="infinity-cloud"')
  })
})
