import { createRequire } from 'node:module'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

const mainFilterWithExternalOutput = () => {
  const config = structuredClone(require(join(process.cwd(), 'mobius/electron-builder.cjs')))
  const { getMainFileMatchers } = require('app-builder-lib/out/fileMatcher')
  const matchers = getMainFileMatchers(
    process.cwd(),
    '/tmp/mobius-package-test/app',
    (value: string) => value,
    {},
    {
      info: {
        config,
        projectDir: process.cwd(),
        buildResourcesDir: 'build',
        debugLogger: { isEnabled: false }
      }
    },
    '/tmp/mobius-package-test',
    false
  )
  const filter = matchers[0].createFilter()
  return (path: string) => filter(join(process.cwd(), path), { isDirectory: () => false })
}

describe('Mobius electron-builder resolved configuration', () => {
  it.each([
    'NSDesktopFolderUsageDescription',
    'NSDocumentsFolderUsageDescription',
    'NSDownloadsFolderUsageDescription',
    'NSNetworkVolumesUsageDescription',
    'NSRemovableVolumesUsageDescription',
    'NSLocalNetworkUsageDescription'
  ])('keeps native privacy purpose %s under the Mobius identity', (key) => {
    const config = require(join(process.cwd(), 'mobius/electron-builder.cjs')) as {
      mac?: { extendInfo?: Record<string, string> }
    }
    expect(config.mac?.extendInfo?.[key]).toEqual(expect.stringMatching(/^Mobius Science \S/))
  })
  it('excludes dependency author agent settings from the production dependency filter', () => {
    const config = structuredClone(require(join(process.cwd(), 'mobius/electron-builder.cjs')))
    const { getNodeModuleFileMatcher } = require('app-builder-lib/out/fileMatcher')
    const matcher = getNodeModuleFileMatcher(
      process.cwd(),
      '/tmp/mobius-package-test/app',
      (value: string) => value,
      {},
      { config, debugLogger: { isEnabled: false } }
    )
    const include = (path: string): boolean =>
      matcher.createFilter()(join(process.cwd(), path), { isDirectory: () => false })
    for (const path of [
      'node_modules/resolve/.claude/notes.md',
      'node_modules/resolve/.claude/settings.local.json',
      'node_modules/example/.codex/config.toml'
    ])
      expect(include(path), path).toBe(false)
    expect(include('node_modules/resolve/index.js')).toBe(true)
    expect(include('node_modules/example/dist/index.js')).toBe(true)
  })
  it('never nests previous releases or local files when the output directory is overridden', () => {
    const include = mainFilterWithExternalOutput()
    for (const path of [
      'dist/mobius-science-old.dmg',
      'dist/mac-arm64/Mobius Science.app/Contents/Resources/app.asar',
      'old-release.zip',
      'test-results/trace.zip',
      '.scratch/probe.json',
      'e2e/fixtures/private-session.json',
      'notes/local-profile.json',
      'resources/bin/mac/arm64/micromamba'
    ])
      expect(include(path), path).toBe(false)
    for (const path of [
      'out/main/index.js',
      'out/renderer/index.html',
      'package.json',
      'resources/skills/pdf-report-generation/references/methodology.md'
    ]) {
      expect(include(path), path).toBe(true)
    }
  })
  it('owns visible package identity, icons, Session association, and update policy', () => {
    const configPath = join(process.cwd(), 'mobius', 'electron-builder.cjs')
    delete require.cache[require.resolve(configPath)]
    const config = require(configPath) as {
      appId?: string
      productName?: string
      fileAssociations?: Array<{ ext?: string; mimeType?: string; name?: string }>
      win?: {
        executableName?: string
        icon?: string
        artifactName?: string
        fileAssociations?: unknown[]
      }
      mac?: {
        icon?: string
        artifactName?: string
        extendInfo?: Record<string, string>
        fileAssociations?: unknown[]
      }
      dmg?: {
        background?: string
        icon?: string
        title?: string
        contents?: Array<{ name?: string; type?: string }>
      }
      linux?: { executableName?: string; fileAssociations?: unknown[] }
      publish?: unknown
    }

    expect(config.appId).toBe('com.mobius.science')
    expect(config.productName).toBe('Mobius Science')
    expect(config.fileAssociations).toContainEqual(
      expect.objectContaining({
        ext: 'mobius',
        mimeType: 'application/x-mobius-science-session',
        name: 'Mobius Science Session package'
      })
    )
    expect(config.win).toMatchObject({
      executableName: 'mobius-science',
      icon: 'mobius/generated/app/icon.ico'
    })
    expect(config.mac).toMatchObject({
      icon: 'mobius/generated/app/icon.icon',
      extendInfo: {
        CFBundleName: 'Mobius Science',
        CFBundleDisplayName: 'Mobius Science'
      }
    })
    expect(config.dmg).toMatchObject({
      background: 'mobius/generated/app/dmg-background.png',
      icon: 'mobius/generated/app/icon.icns',
      title: 'Mobius Science'
    })
    expect(config.dmg?.contents).toEqual([
      expect.objectContaining({ name: 'Mobius Science.app' }),
      expect.objectContaining({ type: 'link' })
    ])
    expect(config.dmg?.contents).not.toContainEqual(
      expect.objectContaining({ name: 'Open-Science.app' })
    )
    expect(config.mac?.fileAssociations).toBeUndefined()
    expect(config.win?.fileAssociations).toBeUndefined()
    expect(config.linux?.fileAssociations).toBeUndefined()
    expect(config.linux?.executableName).toBe('mobius-science')
    expect(config.publish).toBeNull()
  })
})
