import { describe, expect, it, vi } from 'vitest'
import {
  FullTextDestinationError,
  isPublicFullTextAddress,
  queryPublicDns,
  resolveFullTextDestination
} from './full-text-destination-verifier'

const proxy = new URL('socks5://127.0.0.1:1086')
const input = { hostname: 'journal.example', proxy, signal: new AbortController().signal }
const publicIp = { address: '93.184.216.34', family: 4 as const }
const fakeIp = { address: '198.18.1.7', family: 4 as const }

describe('full-text destination verifier', () => {
  it('keeps ordinary public DNS in the existing path without consulting DoH', async () => {
    const queryPublicDns = vi.fn()
    const result = await resolveFullTextDestination(input, {
      lookupAll: async () => [publicIp],
      queryPublicDns
    })
    expect(result).toEqual({ mode: 'public', addresses: [publicIp] })
    expect(queryPublicDns).not.toHaveBeenCalled()
  })

  it('independently verifies all-synthetic DNS when a proxy is configured', async () => {
    const result = await resolveFullTextDestination(input, {
      lookupAll: async () => [fakeIp],
      queryPublicDns: async () => [publicIp]
    })
    expect(result).toEqual({ mode: 'synthetic', addresses: [publicIp] })
    expect(Object.isFrozen(result.addresses)).toBe(true)
  })

  it.each(['198.18.1.7', '::ffff:198.18.1.7', '::ffff:0:198.18.1.7'])(
    'recognizes an all-synthetic proxy answer in %s form',
    async (address) => {
      const result = await resolveFullTextDestination(input, {
        lookupAll: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
        queryPublicDns: async () => [publicIp]
      })
      expect(result.mode).toBe('synthetic')
    }
  )

  it('rejects synthetic DNS on a direct connection', async () => {
    await expect(
      resolveFullTextDestination(
        { ...input, proxy: undefined },
        {
          lookupAll: async () => [fakeIp],
          queryPublicDns: vi.fn()
        }
      )
    ).rejects.toMatchObject({ reason: 'unsafe-destination' })
  })

  it.each([
    [{ address: '10.0.0.8', family: 4 as const }],
    [publicIp, fakeIp],
    [publicIp, { address: '127.0.0.1', family: 4 as const }],
    []
  ])('rejects unsafe or mixed local answers before DoH', async (...addresses) => {
    const queryPublicDns = vi.fn()
    await expect(
      resolveFullTextDestination(input, {
        lookupAll: async () => addresses,
        queryPublicDns
      })
    ).rejects.toMatchObject({ reason: 'unsafe-destination' })
    expect(queryPublicDns).not.toHaveBeenCalled()
  })

  it.each([
    [{ address: '10.0.0.8', family: 4 as const }],
    [publicIp, { address: '127.0.0.1', family: 4 as const }],
    []
  ])('rejects unsafe independent answers without returning a destination', async (...addresses) => {
    await expect(
      resolveFullTextDestination(input, {
        lookupAll: async () => [fakeIp],
        queryPublicDns: async () => addresses
      })
    ).rejects.toMatchObject({ reason: 'synthetic-verification-failed' })
  })

  it('rejects documentation and transition IPv6 addresses', () => {
    expect(isPublicFullTextAddress('2001:db8::1')).toBe(false)
    expect(isPublicFullTextAddress('2002::a00:1')).toBe(false)
    expect(isPublicFullTextAddress('2606:4700:4700::1111')).toBe(true)
  })

  it('does not leak the publication path in stable errors', () => {
    expect(new FullTextDestinationError('unsafe-destination').message).not.toContain('paper.pdf')
    expect(new FullTextDestinationError('synthetic-verification-failed').message).toContain(
      'synthetic DNS'
    )
  })

  it('bootstraps DoH through fixed numeric endpoints without resolving its hostname', async () => {
    const destinations: string[] = []
    const send = vi.fn(async (_proxy: URL, destination: string, body: Buffer) => {
      destinations.push(destination)
      if (destination === '1.1.1.1') throw new Error('first anycast endpoint unavailable')
      const header = Buffer.alloc(12)
      header.writeUInt16BE(body.readUInt16BE(0), 0)
      header.writeUInt16BE(0x8180, 2)
      header.writeUInt16BE(1, 4)
      header.writeUInt16BE(body.readUInt16BE(body.length - 4) === 1 ? 1 : 0, 6)
      const answer = Buffer.from('c00c000100010000003c00045db8d822', 'hex')
      return Buffer.concat([
        header,
        body.subarray(12),
        ...(body.readUInt16BE(body.length - 4) === 1 ? [answer] : [])
      ])
    })
    const addresses = await queryPublicDns('journal.example', proxy, input.signal, send)
    expect(addresses).toEqual([publicIp])
    expect(destinations).toEqual(['1.1.1.1', '1.0.0.1', '1.1.1.1', '1.0.0.1'])
    expect(destinations.every((address) => !address.includes('cloudflare'))).toBe(true)
  })
})
