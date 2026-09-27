import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createBundledOpenCodeResolver } from './bundled-opencode-preference'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
it('validates the packaged identity and bytes before making it authoritative', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mobius-preferred-runtime-'))
  roots.push(directory)
  const binary = Buffer.from('synthetic executable fixture')
  await writeFile(join(directory, 'opencode'), binary)
  await chmod(join(directory, 'opencode'), 0o755)
  const manifest = {
    schemaVersion: 1,
    binary: 'opencode',
    version: '1.18.31',
    sha256: createHash('sha256').update(binary).digest('hex'),
    sourceBuild: { kind: 'source-patched', regression: 'passed' }
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
  const resolve = createBundledOpenCodeResolver({ directory })
  expect(await resolve()).toEqual({ path: join(directory, 'opencode'), version: '1.18.31' })
  await writeFile(join(directory, 'opencode'), 'corrupt')
  await expect(createBundledOpenCodeResolver({ directory })()).rejects.toThrow(/checksum/)
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({ ...manifest, binary: '../outside' })
  )
  await expect(createBundledOpenCodeResolver({ directory })()).rejects.toThrow(/identity/)
})
it('leaves development discovery intact when no bundled directory exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mobius-unbundled-runtime-'))
  roots.push(root)
  await mkdir(join(root, 'resources'))
  expect(
    await createBundledOpenCodeResolver({
      directory: join(root, 'resources/missing'),
      required: false
    })()
  ).toBeUndefined()
})

it('does not fall back when a packaged or explicitly configured runtime is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mobius-missing-runtime-'))
  roots.push(root)
  const directory = join(root, 'missing')
  await expect(createBundledOpenCodeResolver({ directory, required: true })()).rejects.toThrow(
    /missing/
  )
  vi.stubEnv('MOBIUS_OPENCODE_DIR', directory)
  try {
    await expect(createBundledOpenCodeResolver()()).rejects.toThrow(/missing/)
  } finally {
    vi.unstubAllEnvs()
  }
})
