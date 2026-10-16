/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  nativeFiles,
  sourceFingerprint,
  spec,
  verifiedBytes,
  digest
} from '../../scripts/native-components.mjs'
import { buildNativeComponents } from '../../scripts/produce-native-components.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const run = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
export const nativeIdentifier = (name) => `com.mobius.science.native.${name.replaceAll('_', '-')}`
export const nativeReceiptPath = (root, target) =>
  join(root, 'mobius/generated/native-components', target, 'receipt.json')

export const localNativeRecipe = async (root = ROOT) => {
  const hash = createHash('sha256')
  for (const path of ['mobius/scripts/local-native-components.mjs', 'mobius/config/product.json'])
    hash.update(path).update(await readFile(join(root, path)))
  return hash.digest('hex')
}

export const validateLocalNativeReceipt = (receipt, { target, source, recipe }) => {
  const expected = nativeFiles(target)
  if (
    !target.startsWith('darwin-') ||
    receipt?.schemaVersion !== 1 ||
    receipt.product !== 'Mobius Science' ||
    receipt.target !== target ||
    receipt.source !== source ||
    !/^[a-f0-9]{64}$/.test(source) ||
    receipt.recipe !== recipe ||
    !/^[a-f0-9]{64}$/.test(recipe) ||
    receipt.node !== spec.node ||
    receipt.signing !== 'local-ad-hoc' ||
    typeof receipt.compiler !== 'string' ||
    !receipt.compiler.trim() ||
    typeof receipt.sdk !== 'string' ||
    !receipt.sdk.trim() ||
    !Array.isArray(receipt.files) ||
    receipt.files.length !== expected.length
  )
    throw new Error('Missing, stale, or invalid Mobius local native provenance.')
  for (const [index, file] of receipt.files.entries()) {
    if (
      file.package !== expected[index].package ||
      file.name !== expected[index].name ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      file.size > 20 * 1024 * 1024
    )
      throw new Error('Invalid Mobius local native component record.')
  }
  return receipt
}

export const verifyLocalNativeSignature = (path, name, target) => {
  if (target !== `${process.platform}-${process.arch}`)
    throw new Error('Verify Mobius local native signatures on their native target.')
  run('codesign', ['--verify', '--strict', '--verbose=2', path])
  // codesign displays identity details on stderr, which execFileSync does not return.
  const display = spawnSync('codesign', ['--display', '--verbose=4', path], { encoding: 'utf8' })
  if (display.error || display.status !== 0)
    throw display.error ?? new Error('Cannot inspect native signature.')
  const text = `${display.stdout}\n${display.stderr}`
  if (
    !text.split('\n').includes(`Identifier=${nativeIdentifier(name)}`) ||
    !/^Signature=adhoc$/m.test(text)
  )
    throw new Error(`Native component is not signed with its Mobius local identity: ${name}`)
  const arch = run('lipo', ['-archs', path])
  if (arch !== (target.endsWith('-x64') ? 'x86_64' : 'arm64'))
    throw new Error(`Mobius native component architecture mismatch: ${name}`)
}

export const verifyLocalNativeFiles = async (directory, receipt, packageLayout = false) => {
  for (const file of receipt.files) {
    const path = packageLayout
      ? join(directory, file.package, 'build/Release', file.name)
      : join(directory, file.name)
    await verifiedBytes(path, file)
    verifyLocalNativeSignature(path, file.name, receipt.target)
  }
}

const readValidatedReceipt = async (root, target, path) =>
  validateLocalNativeReceipt(await json(path), {
    target,
    source: await sourceFingerprint(root),
    recipe: await localNativeRecipe(root)
  })

export const verifyStagedLocalNativeComponents = async (
  root = ROOT,
  target = `${process.platform}-${process.arch}`
) => {
  const receipt = await readValidatedReceipt(root, target, nativeReceiptPath(root, target))
  await verifyLocalNativeFiles(join(root, 'packages'), receipt, true)
  return receipt
}

export const verifyPackagedLocalNativeComponents = async (resources, target, root = ROOT) => {
  const receipt = await readValidatedReceipt(
    root,
    target,
    join(resources, 'mobius-native-components.json')
  )
  const sourceReceipt = await readFile(nativeReceiptPath(root, target), 'utf8')
  if (
    digest(Buffer.from(sourceReceipt)) !==
    digest(await readFile(join(resources, 'mobius-native-components.json')))
  )
    throw new Error('Packaged Mobius native receipt differs from its source build.')
  const preserved = new Set()
  for (const base of ['backend', 'app.asar.unpacked']) {
    const directory = join(resources, base, 'node_modules/@aipoch')
    await verifyLocalNativeFiles(directory, receipt, true)
    for (const file of receipt.files)
      preserved.add(join(directory, file.package, 'build/Release', file.name))
  }
  return preserved
}

export const produceLocalNativeComponents = async () => {
  const target = `${process.platform}-${process.arch}`
  if (process.platform !== 'darwin' || process.versions.node !== spec.node)
    throw new Error(`Mobius local native producer requires native macOS and Node ${spec.node}.`)
  const compiler = run('xcrun', ['--sdk', 'macosx', 'clang', '--version'])
  const sdk = run('xcrun', ['--sdk', 'macosx', '--show-sdk-version'])
  const toolchain = {
    CC: run('xcrun', ['--sdk', 'macosx', '--find', 'clang']),
    CXX: run('xcrun', ['--sdk', 'macosx', '--find', 'clang++']),
    SDKROOT: run('xcrun', ['--sdk', 'macosx', '--show-sdk-path'])
  }
  const source = await sourceFingerprint(ROOT)
  const recipe = await localNativeRecipe(ROOT)
  const previous = Object.fromEntries(Object.keys(toolchain).map((key) => [key, process.env[key]]))
  try {
    Object.assign(process.env, toolchain)
    buildNativeComponents()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  const files = []
  for (const file of nativeFiles(target)) {
    const path = join(ROOT, 'packages', file.package, 'build/Release', file.name)
    run('codesign', [
      '--force',
      '--options',
      'runtime',
      '--sign',
      '-',
      '--identifier',
      nativeIdentifier(file.name),
      path
    ])
    verifyLocalNativeSignature(path, file.name, target)
    const bytes = await readFile(path)
    files.push({ ...file, size: bytes.length, sha256: digest(bytes) })
  }
  if (source !== (await sourceFingerprint(ROOT)) || recipe !== (await localNativeRecipe(ROOT)))
    throw new Error('Native sources changed while compiling.')
  const receipt = {
    schemaVersion: 1,
    product: 'Mobius Science',
    target,
    source,
    recipe,
    node: spec.node,
    signing: 'local-ad-hoc',
    compiler,
    sdk,
    toolchain,
    files
  }
  validateLocalNativeReceipt(receipt, { target, source, recipe: receipt.recipe })
  const destination = nativeReceiptPath(ROOT, target)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, JSON.stringify(receipt, null, 2) + '\n')
  return verifyStagedLocalNativeComponents(ROOT, target)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'build') console.log(JSON.stringify(await produceLocalNativeComponents()))
  else if (process.argv[2] === 'verify')
    console.log(JSON.stringify(await verifyStagedLocalNativeComponents()))
  else throw new Error('Usage: local-native-components.mjs build | verify')
}
