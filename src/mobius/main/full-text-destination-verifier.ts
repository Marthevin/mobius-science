import { randomInt } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { once } from 'node:events'
import { Agent, request } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { connect as connectTls } from 'node:tls'
import { tunnelThroughProxy } from '@aipoch/notebook-network-sandbox'

import {
  decodeDnsResponse,
  encodeDnsQuery,
  type FullTextAddress,
  type DnsRecordType
} from './full-text-dns-message'

type FullTextDestination = Readonly<{
  mode: 'public' | 'synthetic'
  addresses: readonly FullTextAddress[]
}>

type FullTextDestinationDependencies = Readonly<{
  lookupAll: (hostname: string) => Promise<readonly Readonly<{ address: string; family: number }>[]>
  queryPublicDns: (
    hostname: string,
    proxy: URL,
    signal: AbortSignal
  ) => Promise<readonly FullTextAddress[]>
}>

type FullTextDestinationInput = Readonly<{
  hostname: string
  proxy?: URL
  signal: AbortSignal
}>

type FullTextDestinationReason = 'unsafe-destination' | 'synthetic-verification-failed'

class FullTextDestinationError extends Error {
  constructor(readonly reason: FullTextDestinationReason) {
    super(
      reason === 'unsafe-destination'
        ? 'Full-text host resolved to a private or reserved destination.'
        : 'The proxy uses synthetic DNS, but Mobius Science could not independently verify a public destination.'
    )
    this.name = 'FullTextDestinationError'
  }
}

const blockedIpv4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const)
  blockedIpv4.addSubnet(address, prefix, 'ipv4')

const blockedIpv6 = new BlockList()
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20]
] as const)
  blockedIpv6.addSubnet(address, prefix, 'ipv6')

const syntheticIpv4 = new BlockList()
syntheticIpv4.addSubnet('198.18.0.0', 15, 'ipv4')
const syntheticIpv6 = new BlockList()
syntheticIpv6.addSubnet('::ffff:198.18.0.0', 111, 'ipv6')
syntheticIpv6.addSubnet('::ffff:0:198.18.0.0', 111, 'ipv6')

const isPublicFullTextAddress = (address: string): boolean => {
  const family = isIP(address)
  if (family === 4) return !blockedIpv4.check(address, 'ipv4')
  if (family !== 6 || address.includes('%')) return false
  return /^[23][0-9a-f]{3}:/iu.test(address) && !blockedIpv6.check(address, 'ipv6')
}

const isSyntheticFullTextAddress = (address: string): boolean => {
  const family = isIP(address)
  return family === 4
    ? syntheticIpv4.check(address, 'ipv4')
    : family === 6 && !address.includes('%') && syntheticIpv6.check(address, 'ipv6')
}

const fixedResolverAddresses = Object.freeze([
  '1.1.1.1',
  '1.0.0.1',
  '2606:4700:4700::1111',
  '2606:4700:4700::1001'
])

const requestDnsMessage = async (
  proxy: URL,
  destination: string,
  body: Buffer,
  signal: AbortSignal
): Promise<Buffer> => {
  const agent = new Agent({ keepAlive: false, maxSockets: 1 })
  agent.createConnection = (_options, callback) => {
    void tunnelThroughProxy(proxy, destination, 443, undefined, signal)
      .then(async (tunnel) => {
        const secure = connectTls({
          socket: tunnel,
          servername: 'cloudflare-dns.com',
          rejectUnauthorized: true
        })
        try {
          await once(secure, 'secureConnect', { signal })
          if (!secure.authorized) throw new Error('DoH TLS certificate was not authorized.')
          return secure
        } catch (error) {
          secure.destroy()
          throw error
        }
      })
      .then(
        (socket) => callback?.(null, socket),
        (error: Error) => callback?.(error, undefined!)
      )
    return undefined
  }
  return new Promise<Buffer>((resolve, reject) => {
    const outgoing = request(
      {
        protocol: 'https:',
        hostname: 'cloudflare-dns.com',
        port: 443,
        path: '/dns-query',
        method: 'POST',
        agent,
        signal,
        headers: {
          Accept: 'application/dns-message',
          'Content-Type': 'application/dns-message',
          'Content-Length': body.length
        }
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          String(response.headers['content-type'] ?? '')
            .split(';')[0]!
            .trim()
            .toLowerCase() !== 'application/dns-message' ||
          Number(response.headers['content-length'] ?? 0) > 65_536
        ) {
          response.destroy()
          reject(new Error('Independent DNS response was invalid.'))
          return
        }
        const chunks: Buffer[] = []
        let bytes = 0
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > 65_536) {
            response.destroy()
            reject(new Error('Independent DNS response exceeded limit.'))
          } else chunks.push(chunk)
        })
        response.on('end', () => resolve(Buffer.concat(chunks)))
        response.on('error', reject)
      }
    )
    outgoing.on('error', reject)
    outgoing.end(body)
  }).finally(() => agent.destroy())
}

const queryPublicDns = async (
  hostname: string,
  proxy: URL,
  signal: AbortSignal,
  send: typeof requestDnsMessage = requestDnsMessage
): Promise<readonly FullTextAddress[]> => {
  const results: FullTextAddress[] = []
  for (const recordType of [1, 28] as const satisfies readonly DnsRecordType[]) {
    signal.throwIfAborted()
    const id = randomInt(0x10000)
    const query = encodeDnsQuery(hostname, recordType, id)
    let response: Buffer | undefined
    let lastError: unknown
    for (const address of fixedResolverAddresses) {
      signal.throwIfAborted()
      try {
        response = await send(proxy, address, query, signal)
        break
      } catch (error) {
        lastError = error
      }
    }
    if (!response) throw lastError ?? new Error('Independent DNS unavailable.')
    results.push(...decodeDnsResponse(response, { id, hostname, recordType }))
  }
  return results
}

const defaultDependencies: FullTextDestinationDependencies = {
  lookupAll: (hostname) => lookup(hostname, { all: true }),
  queryPublicDns
}

const resolveFullTextDestination = async (
  input: FullTextDestinationInput,
  dependencies: FullTextDestinationDependencies = defaultDependencies
): Promise<FullTextDestination> => {
  input.signal.throwIfAborted()
  let local: readonly Readonly<{ address: string; family: number }>[]
  try {
    local = await dependencies.lookupAll(input.hostname)
  } catch {
    input.signal.throwIfAborted()
    throw new FullTextDestinationError('unsafe-destination')
  }
  input.signal.throwIfAborted()
  if (!local.length || local.some(({ address, family }) => isIP(address) !== family)) {
    throw new FullTextDestinationError('unsafe-destination')
  }
  const frozen = (
    mode: FullTextDestination['mode'],
    addresses: readonly Readonly<{ address: string; family: number }>[]
  ): FullTextDestination =>
    Object.freeze({
      mode,
      addresses: Object.freeze(
        addresses.map(({ address, family }) => Object.freeze({ address, family: family as 4 | 6 }))
      )
    })
  if (local.every(({ address }) => isPublicFullTextAddress(address))) return frozen('public', local)
  if (!input.proxy || !local.every(({ address }) => isSyntheticFullTextAddress(address))) {
    throw new FullTextDestinationError('unsafe-destination')
  }
  let verified: readonly FullTextAddress[]
  try {
    verified = await dependencies.queryPublicDns(input.hostname, input.proxy, input.signal)
  } catch {
    input.signal.throwIfAborted()
    throw new FullTextDestinationError('synthetic-verification-failed')
  }
  input.signal.throwIfAborted()
  if (
    !verified.length ||
    verified.some(
      ({ address, family }) => family !== isIP(address) || !isPublicFullTextAddress(address)
    )
  ) {
    throw new FullTextDestinationError('synthetic-verification-failed')
  }
  return frozen('synthetic', verified)
}

export {
  FullTextDestinationError,
  isPublicFullTextAddress,
  queryPublicDns,
  resolveFullTextDestination
}
export type { FullTextDestination, FullTextDestinationDependencies }
