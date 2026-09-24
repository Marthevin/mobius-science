import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { PRODUCT } from '../shared/product-config'

import {
  migrateLegacyProjectDatabase,
  projectDatabasePath,
  resolveExistingProjectDatabasePath
} from './project-database-identity'
import {
  createProjectDbClient,
  disconnectProjectDbClient,
  getProjectDbClient,
  migrateApplicationDatabase
} from '../../main/projects/prisma-client'

const roots: string[] = []
const temporaryRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'mobius-database-identity-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Mobius project database identity', () => {
  it('creates only the branded database for a fresh Prisma client', async () => {
    const root = temporaryRoot()
    const client = createProjectDbClient(root)
    await migrateApplicationDatabase(client)
    await client.$disconnect()

    expect(existsSync(join(root, 'mobius-science.db'))).toBe(true)
    expect(existsSync(join(root, 'open-science.db'))).toBe(false)
  })

  it('uses a Mobius-owned filename for new profiles', () => {
    const root = temporaryRoot()

    expect(projectDatabasePath(root)).toBe(join(root, 'mobius-science.db'))
    expect(resolveExistingProjectDatabasePath(root)).toBe(join(root, 'mobius-science.db'))
  })

  it('migrates a legacy SQLite database without losing committed data', () => {
    const root = temporaryRoot()
    const legacyPath = join(root, 'open-science.db')
    const database = new DatabaseSync(legacyPath)
    database.exec('PRAGMA journal_mode = WAL')
    database.exec('CREATE TABLE research (id INTEGER PRIMARY KEY, title TEXT NOT NULL)')
    database.prepare('INSERT INTO research (title) VALUES (?)').run('replication study')
    database.close()

    expect(resolveExistingProjectDatabasePath(root)).toBe(legacyPath)
    const migratedPath = migrateLegacyProjectDatabase(root)

    expect(migratedPath).toBe(join(root, 'mobius-science.db'))
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(`${legacyPath}-wal`)).toBe(false)
    expect(existsSync(`${legacyPath}-shm`)).toBe(false)

    const migrated = new DatabaseSync(migratedPath, { readOnly: true })
    expect(migrated.prepare('SELECT title FROM research').get()).toEqual({
      title: 'replication study'
    })
    migrated.close()
  })

  it('refuses to choose silently when valid branded and legacy databases coexist', () => {
    const root = temporaryRoot()
    const activePath = projectDatabasePath(root)
    const legacyPath = join(root, 'open-science.db')
    const active = new DatabaseSync(activePath)
    const legacy = new DatabaseSync(legacyPath)

    try {
      for (const [database, marker] of [
        [active, 'branded'],
        [legacy, 'legacy']
      ] as const) {
        database.exec('PRAGMA journal_mode = WAL')
        database.exec(
          'CREATE TABLE ComputeCredential (id INTEGER PRIMARY KEY, ciphertext BLOB NOT NULL)'
        )
        database.prepare('INSERT INTO ComputeCredential (ciphertext) VALUES (?)').run(marker)
      }

      expect(() => resolveExistingProjectDatabasePath(root)).toThrowError(
        'Both Mobius and legacy project databases exist; recovery is required before startup.'
      )
      expect(() => migrateLegacyProjectDatabase(root)).toThrowError(
        'Both Mobius and legacy project databases exist; recovery is required before startup.'
      )
    } finally {
      active.close()
      legacy.close()
    }

    expect(existsSync(activePath)).toBe(true)
    expect(existsSync(legacyPath)).toBe(true)
  })

  it('runs the compatibility migration before the production Prisma client opens', async () => {
    const root = temporaryRoot()
    const legacyPath = join(root, 'open-science.db')
    const legacy = createProjectDbClient(root, PRODUCT.legacyDatabaseFileNames[0])
    await migrateApplicationDatabase(legacy)
    await legacy.$disconnect()

    const active = await getProjectDbClient(root)
    await expect(active.project.count()).resolves.toBe(0)
    await disconnectProjectDbClient()

    const activePath = projectDatabasePath(root)
    expect(existsSync(activePath)).toBe(true)
    expect(existsSync(legacyPath)).toBe(false)
  }, 30_000)
})
