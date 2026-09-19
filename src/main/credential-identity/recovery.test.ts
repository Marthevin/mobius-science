import { expect, it } from 'vitest'
import { credentialRecoveryMessage } from './recovery'
import { CredentialIdentityError } from './selection'

it('explains how to recover when branded and legacy databases coexist', () => {
  const error = new CredentialIdentityError('project-database-conflict')
  const english = credentialRecoveryMessage(error, ['en'])
  expect(english).toContain('Project database needs recovery')
  expect(english).toContain('mobius-science.db')
  expect(english).toContain('open-science.db')
  expect(english).toContain('entire configuration folder')
  expect(english).toContain('-wal')
  expect(english).toContain('SQLite-aware recovery')
  expect(english).toContain('PROJECT_DATABASE: conflicting-files')

  const chinese = credentialRecoveryMessage(error, ['zh-CN'])
  expect(chinese).toContain('项目数据库需要恢复')
  expect(chinese).toContain('备份整个配置文件夹')
  expect(chinese).toContain('SQLite 感知的恢复流程')
})

it.each(['linux-backend-unsupported:KWallet', 'linux-secret-service-metadata-unavailable'])(
  'explains Linux recovery without suggesting a backend or profile switch: %s',
  (reason) => {
    const english = credentialRecoveryMessage(new CredentialIdentityError(reason), ['en'])
    expect(english).toContain('/usr/bin/busctl')
    expect(english).toContain('without changing the backend or profile')
    const chinese = credentialRecoveryMessage(new CredentialIdentityError(reason), ['zh-CN'])
    expect(chinese).toContain('原有的默认密钥环')
    expect(chinese).toContain(reason)
  }
)

it.each(['keychain-locked', 'keychain-search-incomplete', 'keychain-state-changed'])(
  'includes the concrete macOS probe code in localized recovery guidance: %s',
  (reason) => {
    const error = new CredentialIdentityError('probe-access-blocked', {
      appName: 'Open-Science',
      status: 'access-blocked',
      reason,
      osStatus: 0
    })
    for (const locale of ['en', 'zh-CN']) {
      const message = credentialRecoveryMessage(error, [locale])
      expect(message).toContain('probe-access-blocked')
      expect(message).toContain(reason)
    }
  }
)
