/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, isAbsolute, join, relative, sep } from 'node:path'

const json = async (path) => JSON.parse(await readFile(path, 'utf8'))

export const sha256File = async (path) => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export const inspectAsarHeader = (header, maxBytes) => {
  const entries = []
  const violations = []
  const roots = new Set(['out', 'resources', 'node_modules', 'package.json'])
  const visit = (node, prefix = '') => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const path = prefix ? `${prefix}/${name}` : name
      if (child.files) visit(child, path)
      else {
        entries.push({ path, size: child.size ?? 0, unpacked: Boolean(child.unpacked) })
        if (
          !roots.has(path.split('/')[0]) ||
          /(?:^|\/)(?:test-results|playwright-report|\.scratch|\.git|\.codex|\.claude|\.agents)(?:\/|$)/.test(
            path
          ) ||
          /\.(?:dmg|zip)$|\.app\/(?:Contents\/)?/.test(path)
        ) {
          violations.push(`Forbidden bundled file: ${path}`)
        }
        if (child.link && (isAbsolute(child.link) || child.link.split(/[\\/]/).includes('..'))) {
          violations.push(`Escaping archive link: ${path}`)
        }
      }
    }
  }
  visit(header)
  const packedBytes = entries.filter((x) => !x.unpacked).reduce((n, x) => n + x.size, 0)
  const unpackedBytes = entries.filter((x) => x.unpacked).reduce((n, x) => n + x.size, 0)
  if (packedBytes > maxBytes)
    violations.push(`ASAR size budget exceeded: ${packedBytes} > ${maxBytes}`)
  return {
    entryCount: entries.length,
    packedBytes,
    unpackedBytes,
    violations,
    largestFiles: [...entries].sort((a, b) => b.size - a.size).slice(0, 20)
  }
}

export const verifyRuntimePacks = async (directory, subdir) => {
  const manifest = await json(join(directory, 'manifest.json'))
  if (manifest.schema !== 1 || manifest.subdir !== subdir)
    throw new Error('Runtime target/schema mismatch')
  if (
    Object.keys(manifest.packs ?? {})
      .sort()
      .join(',') !== 'python-3.12,r-4.4'
  ) {
    throw new Error('Expected exactly Python 3.12 and R 4.4 runtime packs')
  }
  for (const [id, pack] of Object.entries(manifest.packs)) {
    if (pack.file !== `${id}.tar.zst` || basename(pack.file) !== pack.file)
      throw new Error(`Invalid runtime archive path: ${id}`)
    const file = join(directory, pack.file)
    if ((await lstat(file)).isSymbolicLink())
      throw new Error(`Runtime archive must not be a symlink: ${id}`)
    if ((await lstat(file)).size !== pack.size || (await sha256File(file)) !== pack.sha256) {
      throw new Error(`Runtime checksum/size mismatch: ${id}`)
    }
  }
  return manifest
}

export const verifyOpenCode = async (directory, arch, version) => {
  const manifest = await json(join(directory, 'manifest.json'))
  if (
    manifest.schemaVersion !== 1 ||
    manifest.package !== `opencode-darwin-${arch}` ||
    manifest.version !== version ||
    manifest.binary !== 'opencode'
  )
    throw new Error('OpenCode pin/target mismatch')
  const binary = join(directory, 'opencode')
  if ((await lstat(binary)).isSymbolicLink() || (await sha256File(binary)) !== manifest.sha256) {
    throw new Error('OpenCode checksum mismatch')
  }
  const reported = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 30_000 }).trim()
  if (reported !== version) throw new Error(`OpenCode executable version mismatch: ${reported}`)
  return manifest
}

export const directoryBytes = async (directory, root = directory) => {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      const target = relative(await realpath(root), await realpath(path))
      if (target === '..' || target.startsWith(`..${sep}`) || isAbsolute(target)) {
        throw new Error(`Bundle symlink escapes application: ${relative(root, path)}`)
      }
    } else if (entry.isDirectory()) total += await directoryBytes(path, root)
    else total += (await lstat(path)).size
  }
  return total
}

export const auditMacApp = async ({ appPath, arch, version, product, policy, dependencyRoot }) => {
  const require = createRequire(
    dependencyRoot ? join(dependencyRoot, 'package.json') : import.meta.url
  )
  const { getRawHeader } = require('@electron/asar')
  const contents = join(appPath, 'Contents')
  const resources = join(contents, 'Resources')
  const asar = join(resources, 'app.asar')
  const header = getRawHeader(asar).header
  const inventory = inspectAsarHeader(header, policy.maxAsarBytes)
  if (inventory.violations.length) throw new Error(inventory.violations.join('\n'))
  if ((await lstat(asar)).size > policy.maxAsarBytes)
    throw new Error('ASAR file exceeds size budget')
  const appBytes = await directoryBytes(appPath)
  if (appBytes > policy.maxAppBytes) throw new Error(`App size budget exceeded: ${appBytes}`)
  for (const path of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']) {
    let node = header
    for (const segment of path.split('/')) node = node?.files?.[segment]
    if (!node) throw new Error(`Missing application entry: ${path}`)
  }
  for (const skill of policy.requiredSkills) {
    const root = join(resources, 'app.asar.unpacked/resources/skills', skill)
    await access(join(root, 'SKILL.md'))
    for (const folder of ['references', 'scripts']) {
      if (!(await readdir(join(root, folder))).length) throw new Error(`Missing ${skill}/${folder}`)
    }
  }
  await access(join(resources, 'node_modules/.prisma/client/index.js'))
  await access(join(resources, 'micromamba'))
  const plist = (key) =>
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(contents, 'Info.plist')], {
      encoding: 'utf8'
    }).trim()
  if (
    plist('CFBundleIdentifier') !== product.appId ||
    plist('CFBundleName') !== product.displayName ||
    plist('CFBundleShortVersionString') !== version
  )
    throw new Error('Packaged product identity mismatch')
  const binaryArch = execFileSync(
    'lipo',
    ['-archs', join(contents, 'MacOS', product.displayName)],
    { encoding: 'utf8' }
  ).trim()
  if (binaryArch !== (arch === 'x64' ? 'x86_64' : arch))
    throw new Error(`Application architecture mismatch: ${binaryArch}`)
  const subdir = arch === 'arm64' ? 'osx-arm64' : 'osx-64'
  const runtimes = await verifyRuntimePacks(join(resources, 'resources/default-envs'), subdir)
  const opencode = await verifyOpenCode(
    join(resources, 'managed-runtimes/opencode'),
    arch,
    product.managedOpencodeVersion
  )
  return {
    appBytes,
    asarBytes: (await lstat(asar)).size,
    asarSha256: await sha256File(asar),
    inventory,
    runtimes,
    opencode
  }
}
