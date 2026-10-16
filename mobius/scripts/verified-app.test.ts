import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('accepts only the exact installed application certified by a ready release', async () => {
  const { verifyInstalledApp } = await import('./verified-app.mjs')
  const root = await mkdtemp(join(tmpdir(), 'mobius-verified-app-'))
  roots.push(root)
  const appPath = join(root, 'Mobius Science.app')
  const resources = join(appPath, 'Contents/Resources')
  await mkdir(resources, { recursive: true })
  await writeFile(join(resources, 'app.asar'), 'accepted bytes')
  await writeFile(join(resources, 'icon.icns'), 'accepted icon')
  await writeFile(join(resources, 'Assets.car'), 'accepted catalog')
  const manifestPath = join(root, 'release-manifest.json')
  const manifest = {
    status: 'ready',
    product: 'Mobius Science',
    commit: '123',
    steps: [
      {
        name: 'bundle-audit',
        result: {
          asarSha256: createHash('sha256').update('accepted bytes').digest('hex'),
          appIcon: {
            path: 'Contents/Resources/icon.icns',
            sha256: createHash('sha256').update('accepted icon').digest('hex')
          },
          iconAssets: [
            {
              path: 'Contents/Resources/Assets.car',
              sha256: createHash('sha256').update('accepted catalog').digest('hex')
            }
          ]
        }
      }
    ]
  }
  await writeFile(manifestPath, JSON.stringify(manifest))
  expect((await verifyInstalledApp({ appPath, manifestPath })).commit).toBe('123')
  await writeFile(join(resources, 'Assets.car'), 'older modern icon')
  await expect(verifyInstalledApp({ appPath, manifestPath })).rejects.toThrow(/icon.*mismatch/i)
  await writeFile(join(resources, 'Assets.car'), 'accepted catalog')
  await writeFile(join(resources, 'icon.icns'), 'old icon')
  await expect(verifyInstalledApp({ appPath, manifestPath })).rejects.toThrow(/icon.*mismatch/i)
  await writeFile(join(resources, 'icon.icns'), 'accepted icon')
  await writeFile(join(resources, 'app.asar'), 'older same-name application')
  await expect(verifyInstalledApp({ appPath, manifestPath })).rejects.toThrow(/fingerprint/)
  await writeFile(manifestPath, JSON.stringify({ ...manifest, status: 'failed' }))
  await expect(verifyInstalledApp({ appPath, manifestPath })).rejects.toThrow(/ready/)
})

it('refuses to launch while a same-name or legacy main process could receive the single-instance handoff', async () => {
  const { assertNoRunningResearchApp } = await import('./verified-app.mjs')
  expect(() =>
    assertNoRunningResearchApp('42 /Applications/Other.app/Contents/MacOS/Other')
  ).not.toThrow()
  for (const executable of [
    '/old/dist/Mobius Science.app/Contents/MacOS/Mobius Science',
    '/Applications/Open-Science.app/Contents/MacOS/Open-Science',
    '/Applications/Mobius Science.app/Contents/MacOS/Mobius Science'
  ])
    expect(() => assertNoRunningResearchApp(`42 ${executable}`)).toThrow(/Quit.*before/i)
})

it('rejects backend dependency or Node changes even when the Electron ASAR is unchanged', async () => {
  const { verifyInstalledApp } = await import('./verified-app.mjs')
  const root = await mkdtemp(join(tmpdir(), 'mobius-verified-backend-'))
  roots.push(root)
  const appPath = join(root, 'Mobius Science.app')
  const resources = join(appPath, 'Contents/Resources')
  await mkdir(join(resources, 'backend/node_modules'), { recursive: true })
  await mkdir(join(resources, 'node-runtime'), { recursive: true })
  await writeFile(join(resources, 'app.asar'), 'accepted bytes')
  await writeFile(join(resources, 'backend/node_modules/dependency.js'), 'accepted dependency')
  await writeFile(join(resources, 'node-runtime/node'), 'accepted node')
  const digest = (bytes: string): string => createHash('sha256').update(bytes).digest('hex')
  const manifestPath = join(root, 'release-manifest.json')
  await writeFile(
    manifestPath,
    JSON.stringify({
      status: 'ready',
      product: 'Mobius Science',
      commit: '123',
      steps: [
        {
          name: 'bundle-audit',
          result: {
            asarSha256: digest('accepted bytes'),
            desktopBackend: {
              backendSha256: digest(
                JSON.stringify([
                  'node_modules/dependency.js',
                  'file',
                  digest('accepted dependency')
                ]) + '\n'
              ),
              nodeRuntime: { executableSha256: digest('accepted node') }
            }
          }
        }
      ]
    })
  )
  await expect(verifyInstalledApp({ appPath, manifestPath })).resolves.toMatchObject({
    commit: '123'
  })
  await writeFile(join(resources, 'backend/node_modules/dependency.js'), 'older dependency')
  await expect(verifyInstalledApp({ appPath, manifestPath })).rejects.toThrow(
    /backend.*fingerprint/i
  )
  await writeFile(join(resources, 'backend/node_modules/dependency.js'), 'accepted dependency')
  await writeFile(join(resources, 'node-runtime/node'), 'older node')
  await expect(verifyInstalledApp({ appPath, manifestPath })).rejects.toThrow(/Node.*fingerprint/i)
})
