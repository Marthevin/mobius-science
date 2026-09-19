import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { PrismaClient } from '@prisma/client'

import {
  classifyDatabaseFailure,
  migrateApplicationDatabase,
  type SchemaMigrationOptions
} from '../database/migration-service'
import {
  migrateLegacyProjectDatabase,
  projectDatabasePath as mobiusProjectDatabasePath
} from '../../mobius/main/project-database-identity'
import { PRODUCT } from '../../mobius/shared/product-config'

const PROJECT_DB_FILE = 'open-science.db'
// SQLite PRAGMAs used by migrations are connection-scoped. Keeping a single connection also avoids
// unnecessary SQLITE_BUSY contention for the local application database.
const PROJECT_DB_CONNECTION_LIMIT = 1
const projectDatabasePath = (configRoot: string, databaseFile = PROJECT_DB_FILE): string =>
  join(configRoot, databaseFile).replace(/\\/g, '/')

// Builds a client bound to the SQLite file under the given config root. Not a singleton, so tests can
// point separate clients at temp directories. Backslashes are normalized so the file: URL is valid on
// Windows (Prisma's SQLite connector expects forward slashes).
const createProjectDbClient = (
  configRoot: string,
  databaseFile = PROJECT_DB_FILE
): PrismaClient => {
  const dbPath = projectDatabasePath(configRoot, databaseFile)

  return new PrismaClient({
    datasources: {
      db: { url: `file:${dbPath}?connection_limit=${PROJECT_DB_CONNECTION_LIMIT}` }
    }
  })
}

let clientPromise: Promise<PrismaClient> | undefined

// Production singleton: ensures the storage directory exists and resolves only after schema verification.
const getProjectDbClient = (
  configRoot: string,
  migrationOptions: SchemaMigrationOptions = {}
): Promise<PrismaClient> => {
  if (!clientPromise) {
    const pending = (async () => {
      let client: PrismaClient | undefined

      try {
        await mkdir(configRoot, { recursive: true })
        migrateLegacyProjectDatabase(configRoot)
        client = createProjectDbClient(configRoot, PRODUCT.databaseFileName)
        await migrateApplicationDatabase(client, {
          ...migrationOptions,
          databasePath: mobiusProjectDatabasePath(configRoot)
        })
      } catch (error) {
        await client?.$disconnect().catch(() => undefined)
        throw classifyDatabaseFailure(error, 'open')
      }

      return client
    })()

    clientPromise = pending
    pending.catch(() => {
      if (clientPromise === pending) clientPromise = undefined
    })
  }

  return clientPromise
}

// Releases the process-wide authority-store connection before operations that require an exclusive
// SQLite checkpoint. The next repository read lazily creates a fresh client.
const disconnectProjectDbClient = async (): Promise<void> => {
  const pending = clientPromise
  if (!pending) return

  clientPromise = undefined
  const client = await pending.catch(() => undefined)
  await client?.$disconnect()
}

export {
  createProjectDbClient,
  disconnectProjectDbClient,
  getProjectDbClient,
  migrateApplicationDatabase
}
