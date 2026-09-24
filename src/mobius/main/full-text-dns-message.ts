import { isIP } from 'node:net'

type DnsRecordType = 1 | 28
type FullTextAddress = Readonly<{ address: string; family: 4 | 6 }>

const MAX_DNS_BODY = 65_536
const MAX_RECORDS = 128

const assertName = (hostname: string): string[] => {
  if (!/^[a-z0-9.-]+$/iu.test(hostname) || hostname.length > 253) {
    throw new Error('Invalid DNS publication hostname.')
  }
  const labels = hostname.toLowerCase().split('.')
  if (
    labels.some(
      (label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
    )
  ) {
    throw new Error('Invalid DNS publication hostname.')
  }
  return labels
}

const encodeDnsQuery = (hostname: string, recordType: DnsRecordType, id: number): Buffer => {
  const labels = assertName(hostname)
  if (!Number.isInteger(id) || id < 0 || id > 0xffff || (recordType !== 1 && recordType !== 28)) {
    throw new Error('Invalid DNS question.')
  }
  const header = Buffer.alloc(12)
  header.writeUInt16BE(id, 0)
  header.writeUInt16BE(0x0100, 2)
  header.writeUInt16BE(1, 4)
  const parts = labels.map((label) =>
    Buffer.concat([Buffer.from([label.length]), Buffer.from(label, 'ascii')])
  )
  const question = Buffer.alloc(5)
  question.writeUInt16BE(recordType, 1)
  question.writeUInt16BE(1, 3)
  return Buffer.concat([header, ...parts, question])
}

const readName = (body: Buffer, offset: number): Readonly<{ name: string; next: number }> => {
  const labels: string[] = []
  const visited = new Set<number>()
  let cursor = offset
  let next = offset
  let jumped = false
  for (let steps = 0; steps < 128; steps += 1) {
    if (cursor >= body.length || visited.has(cursor))
      throw new Error('Invalid DNS name compression.')
    visited.add(cursor)
    const length = body[cursor]!
    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= body.length) throw new Error('Truncated DNS name pointer.')
      const target = ((length & 0x3f) << 8) | body[cursor + 1]!
      if (target >= cursor) throw new Error('Invalid DNS name pointer.')
      if (!jumped) next = cursor + 2
      jumped = true
      cursor = target
      continue
    }
    if ((length & 0xc0) !== 0 || length > 63 || cursor + 1 + length > body.length) {
      throw new Error('Invalid DNS label.')
    }
    cursor += 1
    if (!jumped) next = cursor + length
    if (length === 0) {
      const name = labels.join('.').toLowerCase()
      assertName(name)
      return { name, next }
    }
    const label = body.subarray(cursor, cursor + length).toString('ascii')
    labels.push(label)
    if (labels.join('.').length > 253) throw new Error('DNS name exceeds limit.')
    cursor += length
  }
  throw new Error('DNS name compression exceeds limit.')
}

const decodeDnsResponse = (
  body: Buffer,
  expected: Readonly<{ id: number; hostname: string; recordType: DnsRecordType }>
): readonly FullTextAddress[] => {
  if (body.length < 12 || body.length > MAX_DNS_BODY) throw new Error('Invalid DNS response size.')
  const flags = body.readUInt16BE(2)
  const questions = body.readUInt16BE(4)
  const answers = body.readUInt16BE(6)
  const authorities = body.readUInt16BE(8)
  const additionals = body.readUInt16BE(10)
  if (
    body.readUInt16BE(0) !== expected.id ||
    (flags & 0x8000) === 0 ||
    (flags & 0x7800) !== 0 ||
    (flags & 0x0200) !== 0 ||
    (flags & 0x000f) !== 0 ||
    questions !== 1 ||
    answers + authorities + additionals > MAX_RECORDS
  )
    throw new Error('Invalid DNS response header.')

  const question = readName(body, 12)
  if (
    question.next + 4 > body.length ||
    question.name !== assertName(expected.hostname).join('.')
  ) {
    throw new Error('DNS question mismatch.')
  }
  if (
    body.readUInt16BE(question.next) !== expected.recordType ||
    body.readUInt16BE(question.next + 2) !== 1
  ) {
    throw new Error('DNS question mismatch.')
  }
  let offset = question.next + 4
  const records: Array<
    Readonly<{ name: string; type: number; address?: FullTextAddress; cname?: string }>
  > = []
  for (let index = 0; index < answers + authorities + additionals; index += 1) {
    const owner = readName(body, offset)
    offset = owner.next
    if (offset + 10 > body.length) throw new Error('Truncated DNS record.')
    const type = body.readUInt16BE(offset)
    const recordClass = body.readUInt16BE(offset + 2)
    const dataLength = body.readUInt16BE(offset + 8)
    offset += 10
    if (offset + dataLength > body.length) throw new Error('Truncated DNS record data.')
    if (index < answers && recordClass === 1) {
      if (type === 5) {
        const cname = readName(body, offset)
        if (cname.next !== offset + dataLength) throw new Error('Invalid DNS CNAME.')
        records.push({ name: owner.name, type, cname: cname.name })
      } else if (type === 1 && dataLength === 4) {
        const bytes = [...body.subarray(offset, offset + 4)]
        records.push({ name: owner.name, type, address: { address: bytes.join('.'), family: 4 } })
      } else if (type === 28 && dataLength === 16) {
        const words = Array.from({ length: 8 }, (_unused, i) =>
          body.readUInt16BE(offset + i * 2).toString(16)
        )
        const address = words.join(':')
        if (isIP(address) !== 6) throw new Error('Invalid DNS IPv6 answer.')
        records.push({ name: owner.name, type, address: { address, family: 6 } })
      }
    }
    offset += dataLength
  }
  if (offset !== body.length) throw new Error('Trailing DNS response data.')
  let current = expected.hostname.toLowerCase()
  const visited = new Set<string>()
  while (true) {
    if (visited.has(current) || visited.size > 16) throw new Error('DNS CNAME loop.')
    visited.add(current)
    const aliases = records.filter((record) => record.name === current && record.type === 5)
    if (aliases.length > 1) throw new Error('Ambiguous DNS CNAME.')
    if (!aliases.length) break
    current = aliases[0]!.cname!
  }
  return records
    .filter(
      (record) => record.name === current && record.type === expected.recordType && record.address
    )
    .map((record) => record.address!)
}

export { decodeDnsResponse, encodeDnsQuery }
export type { DnsRecordType, FullTextAddress }
