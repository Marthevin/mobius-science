import { LiteratureProviderError } from './provider-error'
import { Agent, get } from 'node:https'
import { connect as connectTls } from 'node:tls'
import { tunnelThroughProxy } from '@aipoch/notebook-network-sandbox'
import { isIP } from 'node:net'
import type { LiteratureFullTextProgress } from '../../shared/literature'
import {
  isPublicFullTextAddress,
  resolveFullTextDestination,
  type FullTextDestinationDependencies
} from '../../mobius/main/full-text-destination-verifier'

export class FullTextRateLimitError extends Error {
  constructor(readonly retryAt: number) {
    super(
      `Full-text source is rate limited. Retry no earlier than ${new Date(retryAt).toISOString()}.`
    )
  }
}
const retryAfterByOrigin = new Map<string, number>()

export { isPublicFullTextAddress }

export const fullTextUrl = (value: string): URL => {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    isIP(url.hostname.replace(/^\[|\]$/gu, '')) ||
    !url.hostname.includes('.') ||
    /\.(localhost|local|internal)$/iu.test(url.hostname)
  )
    throw new Error('Full-text links must use public HTTPS URLs.')
  return url
}

// Resolve and pin a public address for every connection, including redirects. Never send
// application cookies or provider credentials to a PDF host.
export const downloadFullText = async (
  rawUrl: string,
  maxBytes: number,
  onProgress?: (progress: LiteratureFullTextProgress) => void,
  resolveProxy?: (url: string) => Promise<string | undefined>,
  requestSignal?: AbortSignal,
  destinationDependencies?: FullTextDestinationDependencies
): Promise<Buffer> => {
  const timeout = AbortSignal.timeout(60_000)
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout
  signal.throwIfAborted()
  let url = fullTextUrl(rawUrl)
  const origin = url.origin
  for (const [host, until] of retryAfterByOrigin)
    if (until <= Date.now()) retryAfterByOrigin.delete(host)
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    signal.throwIfAborted()
    const retryAt = retryAfterByOrigin.get(url.origin) ?? retryAfterByOrigin.get(origin)
    if (retryAt && retryAt > Date.now()) throw new FullTextRateLimitError(retryAt)
    const proxy = await resolveProxy?.(url.href)
    signal.throwIfAborted()
    const destination = await resolveFullTextDestination(
      { hostname: url.hostname, ...(proxy ? { proxy: new URL(proxy) } : {}), signal },
      destinationDependencies
    )
    const agent = proxy ? new Agent({ keepAlive: false }) : undefined
    if (agent && proxy) {
      const target = url
      agent.createConnection = (_options, callback) => {
        void (async () => {
          let lastError: unknown
          for (const { address } of destination.addresses) {
            signal.throwIfAborted()
            try {
              const socket = await tunnelThroughProxy(
                new URL(proxy),
                address,
                443,
                undefined,
                signal
              )
              return connectTls({ socket, servername: target.hostname, rejectUnauthorized: true })
            } catch (error) {
              lastError = error
            }
          }
          throw lastError ?? new Error('Full-text public destination was unreachable.')
        })().then(
          (socket) => callback?.(null, socket),
          (error: Error) => callback?.(error, undefined!)
        )
        return undefined
      }
    }
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      const request = get(
        url,
        {
          signal,
          ...(agent ? { agent } : {}),
          headers: { Accept: 'application/pdf', 'User-Agent': 'MobiusScience/1.0' },
          lookup: (_hostname, options, callback) => {
            const addresses = destination.addresses.map(({ address, family }) => ({
              address,
              family
            }))
            const first = addresses[0]!
            callback(null, options.all ? addresses : first.address, first.family)
          }
        },
        resolve
      )
      request.on('error', reject)
    })
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      response.destroy()
      if (!response.headers.location) throw new Error('Full-text redirect has no destination.')
      url = fullTextUrl(new URL(response.headers.location, url).href)
      continue
    }
    if (response.statusCode !== 200) {
      response.destroy()
      if (response.statusCode === 429) {
        const header = response.headers['retry-after']
        const now = Date.now()
        const until = header
          ? /^\d+$/u.test(header)
            ? now + Number(header) * 1000
            : Date.parse(header)
          : NaN
        const retryAt = Number.isFinite(until) && until > now ? until : now + 60_000
        retryAfterByOrigin.set(origin, retryAt)
        retryAfterByOrigin.set(url.origin, retryAt)
        throw new FullTextRateLimitError(retryAt)
      }
      throw new LiteratureProviderError(response.statusCode ?? 0)
    }
    if (Number(response.headers['content-length']) > maxBytes) {
      response.destroy()
      throw new Error('Full-text PDF exceeds the size limit.')
    }
    const chunks: Buffer[] = []
    let length = 0
    const size = Number(response.headers['content-length'])
    const totalBytes = Number.isSafeInteger(size) && size > 0 ? size : undefined
    const started = performance.now()
    const report = (): void =>
      onProgress?.({
        receivedBytes: length,
        totalBytes,
        bytesPerSecond: length / Math.max((performance.now() - started) / 1000, 0.001),
        phase: 'downloading'
      })
    report()
    for await (const chunk of response) {
      signal.throwIfAborted()
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      length += bytes.length
      if (length > maxBytes) {
        response.destroy()
        throw new Error('Full-text PDF exceeds the size limit.')
      }
      chunks.push(bytes)
      report()
    }
    signal.throwIfAborted()
    return Buffer.concat(chunks)
  }
  throw new Error('Full-text download redirected too many times.')
}
