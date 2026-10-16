import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const stage = require('../build/stage-desktop-runtime.cjs')
const { Arch } = require('builder-util')
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-native-provider-'))
  roots.push(root)
  await mkdir(join(root, 'scripts'))
  const record = (step: string): string =>
    `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(join(root, 'steps'))}, ${JSON.stringify(step + '\n')});`
  await writeFile(join(root, 'scripts/native-components.mjs'), record('native-default'))
  await writeFile(join(root, 'scripts/build-backend.mjs'), record('build'))
  await writeFile(
    join(root, 'scripts/stage-node-runtime.mjs'),
    `export async function stageNodeRuntime() { ${record('node')} }`.replace(
      "import { appendFileSync } from 'node:fs';",
      "const { appendFileSync } = await import('node:fs');"
    )
  )
  await writeFile(join(root, 'scripts/stage-backend.mjs'), record('backend'))
  return root
}
it('uses an explicit native provider while retaining backend and Node staging', async () => {
  const root = await fixture()
  await writeFile(
    join(root, 'scripts/native-components.mjs'),
    'throw new Error("wrong native provider")'
  )
  await stage({
    arch: Arch[process.arch],
    electronPlatformName: process.platform,
    packager: { projectDir: root },
    stageNativeComponents: async () => writeFile(join(root, 'steps'), 'native-local\n')
  })
  expect((await readFile(join(root, 'steps'), 'utf8')).trim().split('\n')).toEqual([
    'native-local',
    'build',
    'node',
    'backend'
  ])
})
it('retains the upstream native staging path without an injected provider', async () => {
  const root = await fixture()
  await stage({
    arch: Arch[process.arch],
    electronPlatformName: process.platform,
    packager: { projectDir: root }
  })
  expect((await readFile(join(root, 'steps'), 'utf8')).trim().split('\n')).toEqual([
    'native-default',
    'build',
    'node',
    'backend'
  ])
})
