import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

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

  it('never overwrites an existing Mobius database with a legacy file', () => {
    const root = temporaryRoot()
    const activePath = projectDatabasePath(root)
    const legacyPath = join(root, 'open-science.db')
    writeFileSync(activePath, 'current')
    writeFileSync(legacyPath, 'legacy')

    expect(migrateLegacyProjectDatabase(root)).toBe(activePath)
    expect(resolveExistingProjectDatabasePath(root)).toBe(activePath)
    expect(existsSync(legacyPath)).toBe(true)
  })

  it('runs the compatibility migration before the production Prisma client opens', async () => {
    const root = temporaryRoot()
    const legacyPath = join(root, 'open-science.db')
    const legacy = createProjectDbClient(root)
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
