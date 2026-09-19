import type { LoadAllSessionsResult } from '../../shared/session-persistence'
import {
  loadSessionsAfterProjectRecovery,
  recoverProjectDeletionsForSessionRead,
  type ProjectDeletionRecoveryBackend,
  type ProjectDeletionRecoveryForSessionRead,
  type SessionCatalogHydrator
} from '../session-persistence/ipc'
import type { SessionEnabledComputeHostsOwner } from './session-enabled-hosts-owner'

type SessionCatalogLoader = Readonly<{
  loadAll(): Promise<LoadAllSessionsResult>
  loadAllReadOnly(): Promise<LoadAllSessionsResult>
}>

type SessionCatalogHydration = Readonly<{
  loadAll(): Promise<LoadAllSessionsResult>
  consumeStartupLoad(): Promise<LoadAllSessionsResult>
  primeStartupLoad(): Promise<LoadAllSessionsResult>
  recoverProjectDeletions(): Promise<ProjectDeletionRecoveryForSessionRead>
}>

const createSessionCatalogHydration = (options: {
  owner(): SessionEnabledComputeHostsOwner
  projectRecovery: ProjectDeletionRecoveryBackend
  sessionLoader: SessionCatalogLoader
}): SessionCatalogHydration => {
  const hydrateCatalog: SessionCatalogHydrator = (loadCatalog) =>
    options.owner().hydrateFromSessionCatalog(loadCatalog)
  let loadAllInFlight: Promise<LoadAllSessionsResult> | undefined
  let startupHandoff: Promise<LoadAllSessionsResult> | undefined

  const runLoadAll = (): Promise<LoadAllSessionsResult> => {
    if (loadAllInFlight) return loadAllInFlight
    const operation = loadSessionsAfterProjectRecovery(
      options.projectRecovery,
      options.sessionLoader,
      undefined,
      hydrateCatalog
    )
    loadAllInFlight = operation
    const clear = (): void => {
      if (loadAllInFlight === operation) loadAllInFlight = undefined
    }
    void operation.then(clear, clear)
    return operation
  }

  const loadAll = (): Promise<LoadAllSessionsResult> => {
    return runLoadAll()
  }

  const consumeStartupLoad = (): Promise<LoadAllSessionsResult> => {
    if (!startupHandoff) return runLoadAll()
    const operation = startupHandoff
    startupHandoff = undefined
    return operation
  }

  const primeStartupLoad = (): Promise<LoadAllSessionsResult> => {
    if (startupHandoff) return startupHandoff
    const operation = runLoadAll()
    startupHandoff = operation
    void operation.catch(() => {
      if (startupHandoff === operation) startupHandoff = undefined
    })
    return operation
  }

  return {
    loadAll,
    consumeStartupLoad,
    primeStartupLoad,
    recoverProjectDeletions: () =>
      recoverProjectDeletionsForSessionRead(
        options.projectRecovery,
        options.sessionLoader,
        undefined,
        hydrateCatalog
      )
  }
}

export { createSessionCatalogHydration }
export type { SessionCatalogHydration, SessionCatalogLoader }
