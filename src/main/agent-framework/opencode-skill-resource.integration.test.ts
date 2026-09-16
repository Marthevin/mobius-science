import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable, Writable } from 'node:stream'

import * as acp from '@agentclientprotocol/sdk'
import { expect, it } from 'vitest'

import { createOpencodeFramework } from './opencode'

const opencodePath = process.env.OPENCODE_ACP_PATH

const close = async (server: Server): Promise<void> => {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
}

const terminate = async (child: ChildProcessWithoutNullStreams): Promise<void> => {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      resolve()
    }, 2_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

const chunk = (
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null
): string =>
  `data: ${JSON.stringify({
    id: 'chatcmpl-skill-resource',
    object: 'chat.completion.chunk',
    created: 1,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }]
  })}\n\n`

it.runIf(opencodePath)(
  'lets native OpenCode Read consume a materialized Skill reference without exposing config or editing the Skill',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-science-opencode-skill-read-'))
    const workspace = join(root, 'workspace')
    const skillDir = join(root, 'opencode', 'config', 'opencode', 'skills', 'probe-skill')
    const referencePath = join(skillDir, 'references', 'research.md')
    const secretPath = join(root, 'opencode', 'config', 'opencode', 'instructions', 'secret.md')
    await mkdir(workspace)
    await mkdir(dirname(referencePath), { recursive: true })
    await mkdir(dirname(secretPath), { recursive: true })
    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: probe-skill\ndescription: Test Skill\n---\n',
      'utf8'
    )
    await writeFile(referencePath, '# SKILL_REFERENCE_MARKER\n', 'utf8')
    await writeFile(secretPath, '# CONFIG_SECRET_MARKER\n', 'utf8')

    const requests: Record<string, unknown>[] = []
    let writeProbeSent = false
    const upstream = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (part: Buffer) => chunks.push(part))
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
        requests.push(body)
        const model = String(body.model)
        const hasToolResult =
          Array.isArray(body.messages) &&
          body.messages.some(
            (message) =>
              typeof message === 'object' &&
              message !== null &&
              (message as { role?: string }).role === 'tool'
          )
        const hasWriteResult =
          Array.isArray(body.messages) &&
          body.messages.some(
            (message) =>
              typeof message === 'object' &&
              message !== null &&
              (message as { tool_call_id?: string }).tool_call_id === 'call_write'
          )
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        if (hasWriteResult) {
          response.end(
            chunk(model, { role: 'assistant', content: 'done' }, null) +
              chunk(model, {}, 'stop') +
              'data: [DONE]\n\n'
          )
          return
        }
        const tools = Array.isArray(body.tools) ? body.tools : []
        if (tools.length === 0) {
          response.end(
            chunk(model, { role: 'assistant', content: 'Skill reference probe' }, null) +
              chunk(model, {}, 'stop') +
              'data: [DONE]\n\n'
          )
          return
        }
        const toolAvailable = (name: string): boolean =>
          tools.some(
            (tool) =>
              typeof tool === 'object' &&
              tool !== null &&
              (tool as { function?: { name?: string } }).function?.name === name
          )
        if (!toolAvailable('read') || !toolAvailable('write')) {
          response.end(
            chunk(model, { role: 'assistant', content: 'read or write tool unavailable' }, null) +
              chunk(model, {}, 'stop') +
              'data: [DONE]\n\n'
          )
          return
        }
        if (hasToolResult) {
          writeProbeSent = true
          response.end(
            chunk(
              model,
              {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_write',
                    type: 'function',
                    function: {
                      name: 'write',
                      arguments: JSON.stringify({ filePath: referencePath, content: '# MUTATED\n' })
                    }
                  }
                ]
              },
              null
            ) +
              chunk(model, {}, 'tool_calls') +
              'data: [DONE]\n\n'
          )
          return
        }
        response.end(
          chunk(
            model,
            {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: 'call_reference',
                  type: 'function',
                  function: {
                    name: 'read',
                    arguments: JSON.stringify({ filePath: referencePath })
                  }
                },
                {
                  index: 1,
                  id: 'call_secret',
                  type: 'function',
                  function: {
                    name: 'read',
                    arguments: JSON.stringify({ filePath: secretPath })
                  }
                }
              ]
            },
            null
          ) +
            chunk(model, {}, 'tool_calls') +
            'data: [DONE]\n\n'
        )
      })
    })
    let agent: ChildProcessWithoutNullStreams | undefined
    const stderr: string[] = []
    try {
      await new Promise<void>((resolve, reject) => {
        upstream.once('error', reject)
        upstream.listen(0, '127.0.0.1', resolve)
      })
      const address = upstream.address() as AddressInfo
      const baseUrl = `http://127.0.0.1:${address.port}/v1`
      const modelConfig = createOpencodeFramework().prepareModelConfig(
        {
          type: 'custom',
          baseUrl,
          openaiBaseUrl: baseUrl,
          apiEndpoints: ['openai'],
          model: 'probe-model',
          key: 'local-test-key'
        },
        { storageRoot: root, executablePath: opencodePath! }
      )
      for (const file of modelConfig.configFiles ?? []) {
        await mkdir(dirname(file.path), { recursive: true })
        await writeFile(file.path, file.content, 'utf8')
      }
      agent = spawn(opencodePath!, ['acp'], {
        cwd: workspace,
        env: { ...process.env, ...modelConfig.env },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      agent.stderr.on('data', (part: Buffer) => stderr.push(part.toString('utf8')))
      const stream = acp.ndJsonStream(
        Writable.toWeb(agent.stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(agent.stdout) as ReadableStream<Uint8Array>
      )
      await acp
        .client({ name: 'open-science-opencode-skill-read-contract' })
        .onRequest(acp.methods.client.session.requestPermission, (ctx) => ({
          // Approve every prompt so the unchanged-file assertion proves the
          // Skill write is denied by OpenCode config, not by this test client.
          outcome: { outcome: 'selected', optionId: ctx.params.options[0].optionId }
        }))
        .onRequest(acp.methods.client.fs.readTextFile, () => ({ content: '' }))
        .onRequest(acp.methods.client.fs.writeTextFile, () => ({}))
        .connectWith(stream, async (ctx) => {
          await ctx.request(acp.methods.agent.initialize, {
            protocolVersion: acp.PROTOCOL_VERSION,
            clientInfo: { name: 'open-science-opencode-skill-read-contract', version: '1.0.0' },
            clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } }
          })
          await ctx
            .buildSession({ cwd: workspace, mcpServers: [] })
            .withSession(async (session) => {
              session.prompt('Read the Skill reference and the adjacent instructions file.')
              for (;;) {
                const update = await session.nextUpdate()
                if (update.kind === 'stop') break
              }
            })
        })

      expect(requests.length).toBeGreaterThanOrEqual(2)
      const followup = JSON.stringify(requests.slice(1))
      if (!followup.includes('SKILL_REFERENCE_MARKER')) {
        const requestsSummary = requests.map((request) => ({
          tools: Array.isArray(request.tools)
            ? (request.tools as { function?: { name?: string } }[]).map(
                (tool) => tool.function?.name
              )
            : [],
          messages: Array.isArray(request.messages)
            ? (request.messages as { role?: string; content?: unknown }[]).map((message) => ({
                role: message.role,
                content: String(message.content ?? '').slice(0, 160)
              }))
            : []
        }))
        throw new Error(`Read marker missing; requests=${JSON.stringify(requestsSummary)}`)
      }
      expect(JSON.stringify(requests)).not.toContain('CONFIG_SECRET_MARKER')
      expect(writeProbeSent).toBe(true)
      expect(await readFile(referencePath, 'utf8')).toBe('# SKILL_REFERENCE_MARKER\n')
    } catch (error) {
      throw new Error(`${String(error)}\n${stderr.join('')}`)
    } finally {
      if (agent) await terminate(agent)
      await close(upstream)
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  },
  60_000
)
