import { describe, expect, it } from 'vitest'
import { decodeDnsResponse, encodeDnsQuery } from './full-text-dns-message'

const question = Buffer.from('076a6f75726e616c076578616d706c650000010001', 'hex')
const response = (
  answers: Buffer,
  options: { id?: number; flags?: number; question?: Buffer; count?: number } = {}
): Buffer => {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(options.id ?? 0x1234, 0)
  header.writeUInt16BE(options.flags ?? 0x8180, 2)
  header.writeUInt16BE(1, 4)
  header.writeUInt16BE(options.count ?? 1, 6)
  return Buffer.concat([header, options.question ?? question, answers])
}
const aRecord = Buffer.from('c00c000100010000003c00045db8d822', 'hex') // 93.184.216.34
const expected = { id: 0x1234, hostname: 'journal.example', recordType: 1 as const }

describe('full-text DNS wire codec', () => {
  it('round-trips one bounded IN question and a matching public A record', () => {
    const query = encodeDnsQuery('journal.example', 1, 0x1234)
    expect(query.length).toBeLessThan(512)
    expect(query.readUInt16BE(0)).toBe(0x1234)
    expect(query.subarray(12)).toEqual(question)
    expect(decodeDnsResponse(response(aRecord), expected)).toEqual([
      { address: '93.184.216.34', family: 4 }
    ])
  })

  it('follows a CNAME only to its terminal answer', () => {
    const alias = Buffer.from('0363646e076578616d706c6500', 'hex')
    const cname = Buffer.concat([Buffer.from('c00c000500010000003c000d', 'hex'), alias])
    const terminal = Buffer.concat([alias, Buffer.from('000100010000003c00045db8d822', 'hex')])
    expect(
      decodeDnsResponse(response(Buffer.concat([cname, terminal]), { count: 2 }), expected)
    ).toEqual([{ address: '93.184.216.34', family: 4 }])
  })

  it.each([
    ['wrong transaction', response(aRecord, { id: 0x1235 })],
    [
      'wrong question',
      response(aRecord, { question: Buffer.from('056f74686572076578616d706c650000010001', 'hex') })
    ],
    ['truncated', response(aRecord, { flags: 0x8380 })],
    ['non-response', response(aRecord, { flags: 0x0100 })],
    ['pointer loop', response(Buffer.from('c021000100010000003c00045db8d822', 'hex'))],
    ['oversized body', Buffer.alloc(65_537)]
  ])('rejects %s', (_name, packet) => {
    expect(() => decodeDnsResponse(packet, expected)).toThrow()
  })

  it('rejects invalid names and ids before building a request', () => {
    expect(() => encodeDnsQuery('bad..example', 1, 1)).toThrow()
    expect(() => encodeDnsQuery(`${'a'.repeat(64)}.example`, 1, 1)).toThrow()
    expect(() => encodeDnsQuery('journal.example', 1, 65_536)).toThrow()
  })
})
