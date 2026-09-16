import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { expect, it } from 'vitest'

type PythonCommand = { command: string; prefixArgs: string[] }

const resolvePython = (): PythonCommand | undefined => {
  const candidates: PythonCommand[] =
    process.platform === 'win32'
      ? [
          { command: 'py', prefixArgs: ['-3'] },
          { command: 'python', prefixArgs: [] }
        ]
      : [
          { command: 'python3', prefixArgs: [] },
          { command: 'python', prefixArgs: [] }
        ]
  return candidates.find(
    ({ command, prefixArgs }) =>
      spawnSync(command, [...prefixArgs, '--version'], { stdio: 'ignore' }).status === 0
  )
}

const python = resolvePython()

it.skipIf(!python)('runs the scientific PDF quality-gate regression suite', () => {
  const script = join(
    __dirname,
    '..',
    '..',
    '..',
    'resources',
    'skills',
    'pdf-report-generation',
    'scripts',
    'test_pdf_quality_gate.py'
  )
  const result = spawnSync(python!.command, [...python!.prefixArgs, script], {
    cwd: join(__dirname, '..', '..', '..'),
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  })

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  expect(result.stderr).toContain('OK')
})
