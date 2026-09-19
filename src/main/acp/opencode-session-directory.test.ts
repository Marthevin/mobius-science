import { describe, expect, it, vi } from 'vitest'

import { reconcileOpenCodeSessionDirectory } from './opencode-session-directory'

const api = {
  baseUrl: 'http://127.0.0.1:4242',
  authorization: 'Basic local-runtime-token'
}

describe('reconcileOpenCodeSessionDirectory', () => {
  it('moves a persisted OpenCode session when its provider directory is stale', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ directory: '/Users/test/OpenScience/workspaces/session' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(
      reconcileOpenCodeSessionDirectory(
        api,
        'ses_provider',
        '/Users/test/MobiusScience/workspaces/session',
        fetchImpl
      )
    ).resolves.toBe('moved')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'http://127.0.0.1:4242/session/ses_provider?directory=%2FUsers%2Ftest%2FMobiusScience%2Fworkspaces%2Fsession'
    )
    expect(String(fetchImpl.mock.calls[1]![0])).toBe(
      'http://127.0.0.1:4242/experimental/control-plane/move-session'
    )
    expect(fetchImpl.mock.calls[1]![1]).toMatchObject({
      method: 'POST',
      headers: {
        authorization: api.authorization,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sessionID: 'ses_provider',
        destination: { directory: '/Users/test/MobiusScience/workspaces/session' },
        moveChanges: false
      })
    })
  })

  it('does not mutate a session that already uses the requested directory', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ directory: '/Users/test/MobiusScience/workspaces/session' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )

    await expect(
      reconcileOpenCodeSessionDirectory(
        api,
        'ses_provider',
        '/Users/test/MobiusScience/workspaces/session',
        fetchImpl
      )
    ).resolves.toBe('already-current')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it.each([
    ['missing session metadata', new Response(null, { status: 404 })],
    [
      'malformed session metadata',
      new Response(JSON.stringify({ directory: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ]
  ])('returns unavailable for %s', async (_name, response) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response)

    await expect(
      reconcileOpenCodeSessionDirectory(api, 'ses_provider', '/workspace', fetchImpl)
    ).resolves.toBe('unavailable')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('returns unavailable when OpenCode rejects the move', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ directory: '/old-workspace' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(new Response('move failed', { status: 400 }))

    await expect(
      reconcileOpenCodeSessionDirectory(api, 'ses_provider', '/workspace', fetchImpl)
    ).resolves.toBe('unavailable')
  })

  it('returns unavailable when the loopback request fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('connection closed'))

    await expect(
      reconcileOpenCodeSessionDirectory(api, 'ses_provider', '/workspace', fetchImpl)
    ).resolves.toBe('unavailable')
  })
})
