import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('keeps the local signature policy distinct and rejects stale native provenance', async () => {
  const local = await import('./local-native-components.mjs')
  expect(local.validateLocalNativeReceipt).toBeTypeOf('function')
  const { nativeFiles, spec } = await import('../../scripts/native-components.mjs')
  const receipt = {
    schemaVersion: 1,
    product: 'Mobius Science',
    target: 'darwin-arm64',
    source: 'a'.repeat(64),
    recipe: 'b'.repeat(64),
    node: spec.node,
    signing: 'local-ad-hoc',
    compiler: 'Apple clang test',
    sdk: '26.0',
    files: nativeFiles('darwin-arm64').map((file: { package: string; name: string }) => ({
      ...file,
      size: 123,
      sha256: 'c'.repeat(64)
    }))
  }
  const identity = { target: 'darwin-arm64', source: receipt.source, recipe: receipt.recipe }
  expect(local.validateLocalNativeReceipt(receipt, identity)).toBe(receipt)
  for (const change of [
    { signing: 'release' },
    { source: 'd'.repeat(64) },
    { recipe: 'd'.repeat(64) },
    { node: '22.22.0' },
    { files: receipt.files.slice(1) },
    { compiler: '' }
  ])
    expect(() => local.validateLocalNativeReceipt({ ...receipt, ...change }, identity)).toThrow()
})

it('invalidates native provenance when the pinned producer archive changes', async () => {
  const { localNativeRecipe } = await import('./local-native-components.mjs')
  const root = await mkdtemp(join(tmpdir(), 'mobius-producer-recipe-'))
  roots.push(root)
  await mkdir(join(root, 'mobius/scripts'), { recursive: true })
  await mkdir(join(root, 'mobius/config'), { recursive: true })
  await copyFile(
    'mobius/scripts/local-native-components.mjs',
    join(root, 'mobius/scripts/local-native-components.mjs')
  )
  await copyFile('mobius/config/product.json', join(root, 'mobius/config/product.json'))
  const manifest = join(root, 'mobius/config/native-producer-node-runtime.json')
  const producer = {
    version: '22.23.3',
    source: 'https://nodejs.org/dist/v22.23.3/SHASUMS256.txt',
    archives: {
      'darwin-arm64': { file: 'node-v22.23.3-darwin-arm64.tar.gz', sha256: 'a'.repeat(64) }
    }
  }
  await writeFile(manifest, JSON.stringify(producer))
  const recipe = await localNativeRecipe(root)
  producer.archives['darwin-arm64'].sha256 = 'b'.repeat(64)
  await writeFile(manifest, JSON.stringify(producer))
  expect(await localNativeRecipe(root)).not.toBe(recipe)
})

it.skipIf(process.platform !== 'darwin')(
  'verifies actual ad-hoc signatures and rejects altered helper bytes',
  async () => {
    const local = await import('./local-native-components.mjs')
    expect(local.verifyLocalNativeFiles).toBeTypeOf('function')
    const { nativeFiles, digest, sourceFingerprint, spec } =
      await import('../../scripts/native-components.mjs')
    const root = await mkdtemp(join(tmpdir(), 'mobius-local-native-'))
    roots.push(root)
    await writeFile(join(root, 'main.c'), 'int main(void) { return 0; }\n')
    execFileSync('xcrun', ['clang', join(root, 'main.c'), '-o', join(root, 'helper')])
    const files = []
    for (const item of nativeFiles(`darwin-${process.arch}`)) {
      const path = join(root, item.name)
      await copyFile(join(root, 'helper'), path)
      execFileSync('codesign', [
        '--force',
        '--sign',
        '-',
        '--identifier',
        local.nativeIdentifier(item.name),
        path
      ])
      const bytes = await readFile(path)
      files.push({ ...item, size: bytes.length, sha256: digest(bytes) })
    }
    await expect(
      local.verifyLocalNativeFiles(root, { target: `darwin-${process.arch}`, files })
    ).resolves.toBeUndefined()
    const source = join(root, 'source')
    for (const path of [
      'package-lock.json',
      '.github/workflows/native-components.yml',
      'scripts/produce-native-components.mjs',
      'scripts/verify-native-component-signatures.ps1',
      'mobius/scripts/local-native-components.mjs',
      'mobius/config/product.json',
      'mobius/config/native-producer-node-runtime.json'
    ]) {
      await mkdir(join(source, path, '..'), { recursive: true })
      await copyFile(join(process.cwd(), path), join(source, path))
    }
    for (const pkg of Object.keys(spec.packages)) {
      await mkdir(join(source, 'packages', pkg), { recursive: true })
      await copyFile(
        join(process.cwd(), 'packages', pkg, 'binding.gyp'),
        join(source, 'packages', pkg, 'binding.gyp')
      )
      await cp(join(process.cwd(), 'packages', pkg, 'src'), join(source, 'packages', pkg, 'src'), {
        recursive: true
      })
    }
    const target = `darwin-${process.arch}`
    const receipt = {
      schemaVersion: 1,
      product: 'Mobius Science',
      target,
      source: await sourceFingerprint(source),
      recipe: await local.localNativeRecipe(source),
      node: spec.node,
      signing: 'local-ad-hoc',
      compiler: 'Apple clang fixture',
      sdk: '26.2',
      files
    }
    const receiptPath = local.nativeReceiptPath(source, target)
    await mkdir(join(receiptPath, '..'), { recursive: true })
    await writeFile(receiptPath, JSON.stringify(receipt))
    const resources = join(root, 'package/Mobius Science.app/Contents/Resources')
    await mkdir(resources, { recursive: true })
    await copyFile(receiptPath, join(resources, 'mobius-native-components.json'))
    for (const base of ['backend', 'app.asar.unpacked']) {
      for (const file of files) {
        const destination = join(
          resources,
          base,
          'node_modules/@aipoch',
          file.package,
          'build/Release',
          file.name
        )
        await mkdir(join(destination, '..'), { recursive: true })
        await copyFile(join(root, file.name), destination)
      }
    }
    expect((await local.verifyPackagedLocalNativeComponents(resources, target, source)).size).toBe(
      10
    )
    const require = createRequire(import.meta.url)
    const afterSign = require('./sign-windows.cjs').default
    const context = {
      arch: require('builder-util').Arch[process.arch],
      electronPlatformName: 'darwin',
      appOutDir: join(root, 'package'),
      packager: { projectDir: source, appInfo: { productFilename: 'Mobius Science' } }
    }
    await expect(afterSign(context)).resolves.toBeUndefined()
    await writeFile(
      join(
        resources,
        'backend/node_modules/@aipoch',
        files[0].package,
        'build/Release',
        files[0].name
      ),
      'corrupted packaged bytes'
    )
    await expect(
      local.verifyPackagedLocalNativeComponents(resources, target, source)
    ).rejects.toThrow(/size|checksum/)
    await expect(afterSign(context)).rejects.toThrow(/size|checksum/)
    await writeFile(join(root, files[0].name), 'corrupt helper')
    await expect(
      local.verifyLocalNativeFiles(root, { target: `darwin-${process.arch}`, files })
    ).rejects.toThrow(/size|checksum/)
  }
)
