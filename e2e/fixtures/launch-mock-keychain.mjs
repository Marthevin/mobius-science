// Test-only bootstrap: Electron removes NODE_OPTIONS in packaged apps, so install the
// isolated backend preload through its paused inspector before application code starts.
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { spawn } from 'node:child_process'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const executable = process.env.OPEN_SCIENCE_E2E_EXECUTABLE
if (
  process.platform !== 'darwin' ||
  process.env.OPEN_SCIENCE_E2E_USE_MOCK_KEYCHAIN !== '1' ||
  !isAbsolute(process.env.OPEN_SCIENCE_E2E_STORAGE_ROOT ?? '') ||
  !isAbsolute(executable ?? '') ||
  !args.includes('--use-mock-keychain')
)
  throw new Error(
    'Inspector credential fixture requires an explicit isolated packaged mock launch.'
  )

const env = { ...process.env }
delete env.NODE_OPTIONS
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(
  executable,
  ['--inspect-brk=0', ...args.filter((arg) => !arg.startsWith('--inspect='))],
  {
    env,
    stdio: ['inherit', 'pipe', 'pipe']
  }
)
child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)
const preload = join(dirname(fileURLToPath(import.meta.url)), 'mock-node-credentials.cjs')
let inspector,
  configured = false,
  configuring = false,
  failed = false,
  buffer = ''
const fail = (error) => {
  if (failed) return
  failed = true
  clearTimeout(timeout)
  console.error(`E2E credential inspector bootstrap failed: ${error.message}`)
  child.kill('SIGTERM')
  inspector?.close()
}
const timeout = setTimeout(() => fail(new Error('timed out before application entry')), 30_000)
child.stderr.on('data', (chunk) => {
  if (inspector || failed) return
  buffer = (buffer + chunk.toString()).slice(-65536)
  const match = buffer.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)
  if (!match) return
  inspector = new WebSocket(match[1])
  let sequence = 0
  const pending = new Map()
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, { resolve, reject })
      inspector.send(JSON.stringify({ id, method, params }))
    })
  inspector.onmessage = async ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const request = pending.get(message.id)
      if (request) {
        pending.delete(message.id)
        if (message.error) request.reject(new Error(message.error.message))
        else request.resolve(message.result)
      }
      return
    }
    if (message.method !== 'Debugger.paused' || configuring) return
    configuring = true
    try {
      const result = await send('Debugger.evaluateOnCallFrame', {
        callFrameId: message.params.callFrames[0].callFrameId,
        expression: `process.env.NODE_OPTIONS=${JSON.stringify('--require=' + JSON.stringify(preload))}`
      })
      if (result.exceptionDetails) throw new Error('environment assignment was rejected')
      const metadata = await send('Debugger.evaluateOnCallFrame', {
        callFrameId: message.params.callFrames[0].callFrameId,
        expression: `require('node:module').createRequire(require('node:path').join(require('electron').app.getAppPath(),'package.json'))('@aipoch/credential-identity-probe-native').executablePath=${JSON.stringify(join(dirname(preload), 'mock-credential-identity.sh'))}`
      })
      if (metadata.exceptionDetails)
        throw new Error('isolated metadata probe assignment was rejected')
      await send('Debugger.resume')
      configured = true
      clearTimeout(timeout)
      inspector.close()
    } catch (error) {
      fail(error)
    }
  }
  inspector.onopen = async () => {
    try {
      await send('Debugger.enable')
      await send('Runtime.runIfWaitingForDebugger')
    } catch (error) {
      fail(error)
    }
  }
  inspector.onerror = () => fail(new Error('cannot connect to the local application inspector'))
  inspector.onclose = () => {
    for (const request of pending.values())
      request.reject(new Error('application inspector closed'))
    pending.clear()
    if (!configured && !failed) fail(new Error('inspector closed before application entry'))
  }
})
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => child.kill(signal))
child.once('error', fail)
child.once('exit', (code) => {
  clearTimeout(timeout)
  inspector?.close()
  process.exitCode = failed || !configured ? 1 : (code ?? 1)
})
