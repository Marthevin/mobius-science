import { Readable } from 'node:stream'
import { beforeEach, expect, it, vi } from 'vitest'
import { downloadFullText } from './full-text-download'

const fixture = vi.hoisted(() => ({
  lookup: vi.fn(),
  tunnel: vi.fn(),
  tls: vi.fn(),
  requests: vi.fn(),
  status: 200,
  location: '',
  queryPublicDns: vi.fn()
}))
vi.mock('node:dns/promises', () => ({ lookup: fixture.lookup }))
vi.mock('@aipoch/notebook-network-sandbox', () => ({ tunnelThroughProxy: fixture.tunnel }))
vi.mock('node:tls', () => ({ connect: fixture.tls }))
vi.mock('node:https', async (original) => ({
  ...(await original<typeof import('node:https')>()),
  get: (
    url: URL,
    options: { agent?: import('node:https').Agent },
    callback: (response: Readable) => void
  ) => {
    fixture.requests(url.href, options)
    let reject: (error: Error) => void = () => {}
    queueMicrotask(() => {
      options.agent!.createConnection({}, (error) => {
        if (error) return reject(error)
        callback(
          Object.assign(Readable.from([Buffer.from('%PDF-test')]), {
            statusCode: fixture.status,
            headers: fixture.location ? { location: fixture.location } : {}
          })
        )
      })
    })
    return {
      on: (_event: string, handler: (error: Error) => void) => {
        reject = handler
      }
    }
  }
}))

beforeEach(() => {
  vi.resetAllMocks()
  fixture.status = 200
  fixture.location = ''
  fixture.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
  fixture.tunnel.mockResolvedValue({ pinned: true })
  fixture.tls.mockReturnValue({ encrypted: true })
  fixture.queryPublicDns.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

it.each(['http', 'https', 'socks4', 'socks5'])(
  'pins the public destination through a %s proxy while authenticating the publisher',
  async (protocol) => {
    const proxy = vi.fn(async () => `${protocol}://127.0.0.1:1086`)
    await expect(
      downloadFullText('https://journal.example/paper.pdf', 100, undefined, proxy)
    ).resolves.toEqual(Buffer.from('%PDF-test'))
    expect(proxy).toHaveBeenCalledWith('https://journal.example/paper.pdf')
    expect(fixture.tunnel).toHaveBeenCalledWith(
      new URL(`${protocol}://127.0.0.1:1086`),
      '8.8.8.8',
      443,
      undefined,
      expect.any(AbortSignal)
    )
    expect(fixture.tls).toHaveBeenCalledWith(
      expect.objectContaining({ servername: 'journal.example', socket: { pinned: true } })
    )
    expect(fixture.requests.mock.calls[0][1].headers).toEqual({
      Accept: 'application/pdf',
      'User-Agent': 'MobiusScience/1.0'
    })
  }
)

it('refuses private or mixed DNS answers before opening any proxy tunnel', async () => {
  fixture.lookup.mockResolvedValue([
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 }
  ])
  await expect(
    downloadFullText(
      'https://journal.example/paper.pdf',
      100,
      undefined,
      async () => 'http://127.0.0.1:1086'
    )
  ).rejects.toThrow('public address')
  expect(fixture.tunnel).not.toHaveBeenCalled()
})

it('resolves proxy and validates DNS again after a redirect', async () => {
  fixture.status = 302
  fixture.location = 'https://redirect.example/paper.pdf'
  fixture.lookup
    .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
    .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }])
  const resolve = vi.fn(async () => 'http://127.0.0.1:1086')
  await expect(
    downloadFullText('https://journal.example/paper.pdf', 100, undefined, resolve)
  ).rejects.toThrow('public address')
  expect(resolve.mock.calls).toEqual([
    ['https://journal.example/paper.pdf'],
    ['https://redirect.example/paper.pdf']
  ])
  expect(fixture.tunnel).toHaveBeenCalledTimes(1)
})

it('pins an independently verified address when proxy DNS returns fake IPs', async () => {
  fixture.lookup.mockResolvedValue([{ address: '198.18.2.4', family: 4 }])
  await expect(
    downloadFullText(
      'https://journal.example/paper.pdf',
      100,
      undefined,
      async () => 'socks5://127.0.0.1:1086',
      undefined,
      { lookupAll: fixture.lookup, queryPublicDns: fixture.queryPublicDns }
    )
  ).resolves.toEqual(Buffer.from('%PDF-test'))
  expect(fixture.queryPublicDns).toHaveBeenCalledWith(
    'journal.example',
    new URL('socks5://127.0.0.1:1086'),
    expect.any(AbortSignal)
  )
  expect(fixture.tunnel).toHaveBeenCalledWith(
    new URL('socks5://127.0.0.1:1086'),
    '93.184.216.34',
    443,
    undefined,
    expect.any(AbortSignal)
  )
})

it('revalidates a synthetic redirect and blocks a private independent answer', async () => {
  fixture.status = 302
  fixture.location = 'https://redirect.example/paper.pdf'
  fixture.lookup
    .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
    .mockResolvedValueOnce([{ address: '198.18.2.4', family: 4 }])
  fixture.queryPublicDns.mockResolvedValue([{ address: '10.0.0.8', family: 4 }])
  await expect(
    downloadFullText(
      'https://journal.example/paper.pdf',
      100,
      undefined,
      async () => 'http://127.0.0.1:1086',
      undefined,
      { lookupAll: fixture.lookup, queryPublicDns: fixture.queryPublicDns }
    )
  ).rejects.toMatchObject({ reason: 'synthetic-verification-failed' })
  expect(fixture.tunnel).toHaveBeenCalledTimes(1)
})
