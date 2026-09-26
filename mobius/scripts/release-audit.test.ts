import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('release artifact acceptance', () => {
  it('rejects stale runtime icons even when the package contains the new icon elsewhere', async () => {
    const { createPackage } = await import('@electron/asar')
    const { verifyBrandAssets } = await import('./release-audit.mjs')
    const root = await mkdtemp(join(tmpdir(), 'mobius-brand-audit-'))
    roots.push(root)
    const source = join(root, 'source')
    const packed = join(root, 'packed')
    await mkdir(join(source, 'mobius/generated/app'), { recursive: true })
    await mkdir(join(source, 'mobius/generated/tray'), { recursive: true })
    await mkdir(join(packed, 'out/main/chunks'), { recursive: true })
    const assets = [
      ['app/icon.png', 'icon-fresh.png'],
      ['tray/trayTemplate.png', 'trayTemplate-fresh.png'],
      ['tray/trayTemplate@2x.png', 'trayTemplate@2x-fresh.png']
    ]
    for (const [input, output] of assets) {
      await writeFile(join(source, 'mobius/generated', input), input)
      await writeFile(join(packed, 'out/main/chunks', output), input)
    }
    const archive = join(root, 'app.asar')
    await createPackage(packed, archive)
    expect(await verifyBrandAssets({ asar: archive, sourceRoot: source })).toHaveLength(3)
    await writeFile(join(packed, 'out/main/chunks/trayTemplate-old.png'), 'legacy icon')
    const stale = join(root, 'stale.asar')
    await createPackage(packed, stale)
    await expect(verifyBrandAssets({ asar: stale, sourceRoot: source })).rejects.toThrow(
      /brand asset/i
    )
    await rm(join(packed, 'out/main/chunks/trayTemplate-old.png'))
    await rm(join(packed, 'out/main/chunks/trayTemplate@2x-fresh.png'))
    const missing = join(root, 'missing.asar')
    await createPackage(packed, missing)
    await expect(verifyBrandAssets({ asar: missing, sourceRoot: source })).rejects.toThrow(
      /missing.*brand asset/i
    )
  })
  it('accepts compiled dist folders inside production dependencies', async () => {
    const { inspectAsarHeader } = await import('./release-audit.mjs')
    const result = inspectAsarHeader(
      {
        files: {
          node_modules: {
            files: {
              library: {
                files: {
                  dist: { files: { 'index.js': { size: 20 } } }
                }
              }
            }
          }
        }
      },
      100
    )
    expect(result.violations).toEqual([])
  })
  it('rejects nested releases even when they are small enough to pass the size budget', async () => {
    const { inspectAsarHeader } = await import('./release-audit.mjs')
    const result = inspectAsarHeader(
      {
        files: {
          dist: { files: { 'old.dmg': { size: 10 } } },
          out: { files: { 'backup.zip': { size: 10 } } }
        }
      },
      1000
    )
    expect(result.violations.join('\n')).toMatch(/dist\/old.dmg/)
    expect(result.violations.join('\n')).toMatch(/out\/backup.zip/)
  })

  it('accounts for packed bytes without double-counting unpacked resources', async () => {
    const { inspectAsarHeader } = await import('./release-audit.mjs')
    const result = inspectAsarHeader(
      {
        files: {
          out: { files: { 'main.js': { size: 50 } } },
          resources: { files: { 'reference.md': { size: 30, unpacked: true } } }
        }
      },
      49
    )
    expect(result.packedBytes).toBe(50)
    expect(result.unpackedBytes).toBe(30)
    expect(result.violations.join('\n')).toMatch(/size budget/)
  })

  it('preserves runtime resources but rejects local state and escaping archive links', async () => {
    const { inspectAsarHeader } = await import('./release-audit.mjs')
    expect(
      inspectAsarHeader(
        { files: { resources: { files: { 'SKILL.md': { size: 12, unpacked: true } } } } },
        100
      ).violations
    ).toEqual([])
    for (const header of [
      { files: { '.codex': { files: { 'state.json': { size: 1 } } } } },
      { files: { resources: { files: { secret: { link: '../../private' } } } } }
    ])
      expect(inspectAsarHeader(header, 100).violations.length).toBeGreaterThan(0)
  })

  it('fails runtime verification on corruption, wrong target, and archive path escape', async () => {
    const { verifyRuntimePacks } = await import('./release-audit.mjs')
    const root = await mkdtemp(join(tmpdir(), 'mobius-runtime-test-'))
    roots.push(root)
    await mkdir(join(root, 'packs'))
    const dir = join(root, 'packs')
    await writeFile(join(dir, 'python-3.12.tar.zst'), 'abc')
    await writeFile(join(dir, 'r-4.4.tar.zst'), 'abc')
    const digest = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    const manifest = {
      schema: 1,
      envVersion: 3,
      subdir: 'osx-arm64',
      packs: {
        'python-3.12': {
          language: 'python',
          version: '3.12',
          file: 'python-3.12.tar.zst',
          size: 3,
          sha256: digest
        },
        'r-4.4': { language: 'r', version: '4.4', file: 'r-4.4.tar.zst', size: 3, sha256: digest }
      }
    }
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
    await expect(verifyRuntimePacks(dir, 'osx-arm64')).resolves.toMatchObject({
      subdir: 'osx-arm64'
    })
    await expect(verifyRuntimePacks(dir, 'osx-64')).rejects.toThrow(/target/)
    await writeFile(join(dir, 'r-4.4.tar.zst'), 'xyz')
    await expect(verifyRuntimePacks(dir, 'osx-arm64')).rejects.toThrow(/checksum/)
    manifest.packs['python-3.12'].file = '../outside'
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
    await expect(verifyRuntimePacks(dir, 'osx-arm64')).rejects.toThrow(/path/)
  })
})
