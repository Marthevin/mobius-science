#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { sha256File } from './release-audit.mjs'

export const assertNoRunningResearchApp = (processList) => {
  if (/\/Contents\/MacOS\/(?:Mobius Science|Open-Science|Open Science)\s*$/m.test(processList))
    throw new Error(
      'Quit all Mobius Science and Open Science instances before verified launch; an existing instance can receive the single-instance handoff.'
    )
}

export const verifyInstalledApp = async ({ appPath, manifestPath }) => {
  if (!isAbsolute(appPath))
    throw new Error('Use an absolute application path, never a display name.')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.status !== 'ready' || manifest.product !== 'Mobius Science')
    throw new Error('A ready Mobius Science release manifest is required.')
  const receipt = manifest.steps?.find((step) => step.name === 'bundle-audit')?.result
  const expected = receipt?.asarSha256
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
    throw new Error('Release manifest has no valid application fingerprint.')
  const canonical = await realpath(appPath)
  const actual = await sha256File(join(canonical, 'Contents/Resources/app.asar'))
  if (actual !== expected)
    throw new Error(
      `Application fingerprint mismatch at ${canonical}; this is not the certified build.`
    )
  const icons = [...(receipt?.appIcon ? [receipt.appIcon] : []), ...(receipt?.iconAssets ?? [])]
  for (const icon of icons) {
    if (
      typeof icon.path !== 'string' ||
      !/^Contents\/Resources\/(?:[^/]+\.icns|Assets\.car)$/.test(icon.path) ||
      !/^[a-f0-9]{64}$/.test(icon.sha256 ?? '')
    )
      throw new Error('Release manifest has no valid icon fingerprint.')
    if ((await sha256File(join(canonical, icon.path))) !== icon.sha256)
      throw new Error(`Application icon fingerprint mismatch at ${canonical}.`)
  }
  return { appPath: canonical, commit: manifest.commit, asarSha256: actual }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      app: { type: 'string', default: '/Applications/Mobius Science.app' },
      manifest: { type: 'string' },
      launch: { type: 'boolean', default: false }
    }
  })
  if (!values.manifest) throw new Error('Pass --manifest /absolute/path/release-manifest.json')
  const evidence = await verifyInstalledApp({ appPath: values.app, manifestPath: values.manifest })
  console.log(JSON.stringify(evidence, null, 2))
  if (values.launch) {
    if (process.platform !== 'darwin') throw new Error('Verified launch currently supports macOS.')
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', evidence.appPath], {
      stdio: 'pipe'
    })
    assertNoRunningResearchApp(
      execFileSync('/bin/ps', ['-ax', '-o', 'pid=', '-o', 'comm='], { encoding: 'utf8' })
    )
    execFileSync('/usr/bin/open', [evidence.appPath])
  }
}
