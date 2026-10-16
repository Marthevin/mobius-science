import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import { expect, it } from 'vitest'

it.each(['win32', 'linux'])('retains the upstream afterSign behavior on %s', async (platform) => {
  const require = createRequire(import.meta.url)
  const received: unknown[] = []
  const exports: { default?: (context: unknown) => Promise<string> } = {}
  new Script(await readFile('mobius/scripts/sign-windows.cjs', 'utf8')).runInNewContext({
    exports,
    require: (id: string) =>
      id === '../../build/sign-windows.cjs'
        ? {
            default: async (context: unknown) => {
              received.push(context)
              return 'upstream-result'
            }
          }
        : require(id)
  })
  const context = { electronPlatformName: platform }
  expect(await exports.default!(context)).toBe('upstream-result')
  expect(received).toEqual([context])
  expect(received[0]).toBe(context)
})
