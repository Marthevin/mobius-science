import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const masterPath = join(root, 'mobius', 'brand', 'mobius-science-icon-master.png')
const generatedRoot = join(root, 'mobius', 'generated')
const scenarioIds = ['subagent', 'reviewer', 'vision', 'session-details'] as const

describe('Mobius Science approved brand assets', () => {
  it('preserves the exact user-approved product mark as the canonical master', async () => {
    const bytes = await readFile(masterPath)
    const metadata = await sharp(bytes).metadata()

    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'fafa0a0434108bc4118f485e25311cbfe7afeed09b0620add406c9e1aa9bbdcc'
    )
    expect(metadata).toMatchObject({ width: 1254, height: 1254, format: 'png', hasAlpha: true })
  })

  it.each(scenarioIds)('provides a transparent square master for %s', async (scenarioId) => {
    const metadata = await sharp(
      join(root, 'mobius', 'brand', 'scenarios', `${scenarioId}-master.png`)
    ).metadata()

    expect(metadata.format).toBe('png')
    expect(metadata.width).toBe(metadata.height)
    expect(metadata.width).toBeGreaterThanOrEqual(1024)
    expect(metadata.hasAlpha).toBe(true)
  })

  it.each([
    ['app/icon-512.png', 512],
    ['app/icon.png', 1024],
    ['app/icon-dark.png', 1024],
    ['renderer/logo.png', 512],
    ['renderer/logo-dark.png', 512],
    ['tray/tray.png', 24],
    ['tray/tray@2x.png', 48],
    ['tray/trayTemplate.png', 16],
    ['tray/trayTemplate@2x.png', 32]
  ] as const)('generates %s at %d px', async (relativePath, size) => {
    const metadata = await sharp(join(generatedRoot, relativePath)).metadata()
    expect(metadata).toMatchObject({ width: size, height: size, format: 'png', hasAlpha: true })
  })

  it.each(scenarioIds)('derives small UI assets for %s', async (scenarioId) => {
    for (const size of [16, 32, 64] as const) {
      const metadata = await sharp(
        join(generatedRoot, 'renderer', 'scenarios', `${scenarioId}-${size}.png`)
      ).metadata()
      expect(metadata).toMatchObject({ width: size, height: size, format: 'png', hasAlpha: true })
    }
  })

  it('points the macOS Icon Composer package at the approved Mobius artwork', async () => {
    const descriptor = JSON.parse(
      await readFile(join(generatedRoot, 'app', 'icon.icon', 'icon.json'), 'utf8')
    ) as { groups?: Array<{ layers?: Array<{ 'image-name'?: string }> }> }

    expect(descriptor.groups?.[0]?.layers?.[0]?.['image-name']).toBe('mobius-science.png')
    expect(
      await readFile(join(generatedRoot, 'app', 'icon.icon', 'Assets', 'mobius-science.png'))
    ).toEqual(await readFile(masterPath))
  })
})
