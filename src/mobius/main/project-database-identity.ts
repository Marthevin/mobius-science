import { existsSync, lstatSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import { PRODUCT } from '../shared/product-config'

const sqliteSidecarSuffixes = ['-wal', '-shm', '-journal'] as const

const assertRegularDatabaseFile = (path: string): void => {
  const metadata = lstatSync(path, { throwIfNoEntry: false })
  if (metadata && (!metadata.isFile() || metadata.isSymbolicLink())) {
    throw new Error(`Project database path is unsafe: ${path}`)
  }
}

const projectDatabasePath = (configRoot: string): string =>
  join(configRoot, PRODUCT.databaseFileName)

const legacyProjectDatabasePaths = (configRoot: string): string[] =>
  PRODUCT.legacyDatabaseFileNames.map((name) => join(configRoot, name))

// Credential identity selection runs before Prisma startup, so it must inspect the current file
// regardless of whether the one-time branded filename migration has run yet.
const resolveExistingProjectDatabasePath = (configRoot: string): string => {
  const activePath = projectDatabasePath(configRoot)
  if (existsSync(activePath)) return activePath

  return legacyProjectDatabasePaths(configRoot).find(existsSync) ?? activePath
}

const checkpointLegacyDatabase = (path: string): void => {
  const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite') | undefined
  if (!sqlite) throw new Error('SQLite database migration is unavailable.')

  const database: DatabaseSync = new sqlite.DatabaseSync(path)
  try {
    const checkpoint = database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as
      Record<string, unknown> | undefined
    const busy = Number(checkpoint?.busy ?? Object.values(checkpoint ?? {})[0])
    if (!Number.isFinite(busy) || busy !== 0) {
      throw new Error('Project database is busy in another process.')
    }
    const integrity = database.prepare('PRAGMA quick_check').all() as Record<string, unknown>[]
    if (
      integrity.length === 0 ||
      integrity.some((row) => !Object.values(row).some((value) => value === 'ok'))
    ) {
      throw new Error('Project database integrity check failed before filename migration.')
    }
  } finally {
    database.close()
  }
}

// Checkpointing first makes the main SQLite file self-contained. The final rename is then atomic
// within the configuration directory, so a crash leaves either the legacy or branded database as
// the complete authority. Existing branded data always wins and is never overwritten.
const migrateLegacyProjectDatabase = (configRoot: string): string => {
  const activePath = projectDatabasePath(configRoot)
  assertRegularDatabaseFile(activePath)
  if (existsSync(activePath)) return activePath

  for (const suffix of sqliteSidecarSuffixes) {
    if (existsSync(`${activePath}${suffix}`)) {
      throw new Error('Incomplete Mobius project database migration requires recovery.')
    }
  }

  const legacyPath = legacyProjectDatabasePaths(configRoot).find(existsSync)
  if (!legacyPath) return activePath
  assertRegularDatabaseFile(legacyPath)
  for (const suffix of sqliteSidecarSuffixes) assertRegularDatabaseFile(`${legacyPath}${suffix}`)

  checkpointLegacyDatabase(legacyPath)
  renameSync(legacyPath, activePath)

  // WAL content was checkpointed into the main database before the atomic rename. These legacy
  // names are now inert and would otherwise make the profile look only partly rebranded.
  for (const suffix of sqliteSidecarSuffixes) rmSync(`${legacyPath}${suffix}`, { force: true })
  return activePath
}

export { migrateLegacyProjectDatabase, projectDatabasePath, resolveExistingProjectDatabasePath }
