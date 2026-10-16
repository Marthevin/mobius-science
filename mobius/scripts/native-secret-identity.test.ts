import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it.skipIf(process.platform !== 'darwin')(
  'reads and creates only allowed native identities through fake Keychain APIs',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'mobius-native-secret-fixture-'))
    try {
      const fixture = join(root, 'native-secret-identity')
      execFileSync(
        'xcrun',
        [
          'clang++',
          '-std=c++17',
          '-Wall',
          '-Wextra',
          '-Werror',
          '-Wno-deprecated-declarations',
          '-framework',
          'Security',
          'mobius/fixtures/native-secret-identity.cc',
          '-o',
          fixture
        ],
        { stdio: 'pipe' }
      )
      expect(execFileSync(fixture, [], { encoding: 'utf8' })).toBe(
        'passed 20 isolated secret identity scenarios\n'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)
