import { describe, expect, it, vi } from 'vitest'

import type { ComputeHost } from '../../shared/compute'
import type { LoadAllSessionsResult, PersistedChatSession } from '../../shared/session-persistence'
import {
  SessionPersistenceCoordinator,
  type SessionFileIndex,
  type SessionMutationRepository
} from '../session-persistence/coordinator'
import { AgentComputeService } from './agent-compute-service'
import { EnabledComputeHostsRegistry } from './enabled-hosts-registry'
import { createSessionCatalogHydration } from './session-catalog-hydration'
import { SessionEnabledComputeHostsOwner } from './session-enabled-hosts-owner'

const createSession = (id: string): PersistedChatSession => ({
  id,
  projectId: 'project-1',
  title: id,
  cwd: '/workspace',
  status: 'idle',
  messages: [],
  filesRevision: 1,
  enabledComputeHosts: ['ssh:alpha'],
  selectedComputeHosts: ['ssh:alpha'],
  createdAt: 1,
  updatedAt: 1
})

const computeHost: ComputeHost = {
  id: 'ssh:alpha',
  providerId: 'ssh:alpha',
  displayName: 'alpha',
  shape: 'direct_ssh',
  sshAlias: 'alpha',
  sshOverrides: undefined,
  scratchRoot: undefined,
  scratchPinned: false,
  concurrencyLimit: undefined,
  probeResult: undefined,
  detailsDoc: '',
  detailsUpdatedAt: undefined,
  detailsUpdatedBy: undefined,
  createdAt: 1,
  updatedAt: 1
}

describe('production Session catalog hydration wiring', () => {
  it('hands the startup hydration to its explicit startup consumer and keeps later reads fresh', async () => {
    const startupResult: LoadAllSessionsResult = {
      sessions: [],
      manifest: { version: 1 as const }
    }
    const refreshedResult: LoadAllSessionsResult = {
      sessions: [createSession('recovered-session')],
      manifest: { version: 1 as const }
    }
    let durableResult = startupResult
    const loadAll = vi.fn(async () => durableResult)
    const hydrateFromSessionCatalog = vi.fn(
      async (loadCatalog: () => Promise<typeof startupResult>) => loadCatalog()
    )
    const hydration = createSessionCatalogHydration({
      owner: () => ({ hydrateFromSessionCatalog }) as unknown as SessionEnabledComputeHostsOwner,
      projectRecovery: { recoverPendingDeletions: async () => undefined },
      sessionLoader: {
        loadAll,
        loadAllReadOnly: vi.fn(async () => startupResult)
      }
    })

    const primed = await hydration.primeStartupLoad()
    const consumed = await hydration.consumeStartupLoad()

    expect(consumed).toBe(primed)
    expect(loadAll).toHaveBeenCalledTimes(1)
    expect(hydrateFromSessionCatalog).toHaveBeenCalledTimes(1)

    durableResult = refreshedResult
    const refreshed = await hydration.loadAll()
    expect(refreshed.sessions).toEqual(refreshedResult.sessions)
    expect(loadAll).toHaveBeenCalledTimes(2)
    expect(hydrateFromSessionCatalog).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent startup catalog hydration requests', async () => {
    const release = Promise.withResolvers<void>()
    const result = { sessions: [], manifest: { version: 1 as const } }
    const loadAll = vi.fn(async () => {
      await release.promise
      return result
    })
    const hydrateFromSessionCatalog = vi.fn(async (loadCatalog: () => Promise<typeof result>) =>
      loadCatalog()
    )
    const hydration = createSessionCatalogHydration({
      owner: () => ({ hydrateFromSessionCatalog }) as unknown as SessionEnabledComputeHostsOwner,
      projectRecovery: { recoverPendingDeletions: async () => undefined },
      sessionLoader: {
        loadAll,
        loadAllReadOnly: vi.fn(async () => result)
      }
    })

    const first = hydration.loadAll()
    const second = hydration.loadAll()
    await vi.waitFor(() => expect(loadAll).toHaveBeenCalledTimes(1))
    release.resolve()

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult).toBe(secondResult)
    expect(firstResult.sessions).toEqual([])
    expect(hydrateFromSessionCatalog).toHaveBeenCalledTimes(1)

    await hydration.loadAll()
    expect(loadAll).toHaveBeenCalledTimes(2)
    expect(hydrateFromSessionCatalog).toHaveBeenCalledTimes(2)
  })

  it('keeps the first Compute operation available to five Sessions created after an old complete snapshot', async () => {
    const durableSessions = new Map<string, PersistedChatSession>()
    const snapshotCaptured = Promise.withResolvers<void>()
    const releaseSnapshot = Promise.withResolvers<void>()
    let firstLoad = true
    const repository: SessionMutationRepository = {
      loadAllWithDiagnostics: vi.fn(async () => {
        const sessions = [...durableSessions.values()].map((session) => structuredClone(session))
        if (firstLoad) {
          firstLoad = false
          snapshotCaptured.resolve()
          await releaseSnapshot.promise
        }
        return {
          result: { sessions, manifest: { version: 1 as const } },
          isComplete: true
        }
      }),
      loadProjectWithDiagnostics: vi.fn(async () => ({ sessions: [], isComplete: true })),
      loadCommittedProjectWithDiagnostics: vi.fn(async () => ({
        sessions: [],
        isComplete: true
      })),
      loadSessionWithDiagnostics: vi.fn(async (_projectId, sessionId) => {
        const session = durableSessions.get(sessionId)
        return session
          ? { status: 'found' as const, session: structuredClone(session) }
          : { status: 'missing' as const }
      }),
      assertSessionIdentityOwnership: vi.fn(async () => undefined),
      saveSession: vi.fn(async (session) => {
        durableSessions.set(session.id, structuredClone(session))
        return session
      }),
      saveCommittedProjectSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
      deleteProjectSessions: vi.fn(async () => undefined),
      getProjectSessionDeletionState: vi.fn(async () => 'live' as const),
      markCommittedProjectSessionsPrepared: vi.fn(async () => undefined),
      completeProjectSessionDeletion: vi.fn(async () => undefined),
      listLegacyProjectSessionTombstones: vi.fn(async () => []),
      saveManifest: vi.fn(async () => undefined)
    }
    const fileIndex: SessionFileIndex = {
      syncSession: vi.fn(async () => []),
      softDeleteSession: vi.fn(async () => 'delete-token'),
      restoreSession: vi.fn(async () => undefined),
      softDeleteProject: vi.fn(async () => 'delete-token'),
      reconcileActiveSessions: vi.fn(async () => undefined),
      reconcileProjectSessions: vi.fn(async () => undefined),
      markReconciliationIncomplete: vi.fn()
    }
    const coordinator = new SessionPersistenceCoordinator(repository, fileIndex)
    const registry = new EnabledComputeHostsRegistry()
    const owner = new SessionEnabledComputeHostsOwner({
      registry,
      hostExists: async (providerId) => providerId === 'ssh:alpha',
      listHostIds: async () => ['ssh:alpha'],
      sessionAuthority: coordinator,
      withDataRootWrite: (operation) => operation()
    })
    const hydration = createSessionCatalogHydration({
      owner: () => owner,
      projectRecovery: { recoverPendingDeletions: async () => undefined },
      sessionLoader: coordinator
    })
    const compute = new AgentComputeService({ list: async () => [computeHost] } as never, registry)

    const loading = hydration.loadAll()
    await snapshotCaptured.promise
    const creations = Array.from({ length: 5 }, (_, index) => {
      const session = createSession(`session-${index + 1}`)
      return owner.createSession(session, (candidate) => coordinator.saveSession(candidate))
    })
    releaseSnapshot.resolve()

    await Promise.all([loading, ...creations])

    const firstComputeOperations = await Promise.all(
      [...durableSessions.keys()].map((sessionId) => compute.listPreferred(sessionId))
    )
    expect(firstComputeOperations).toEqual(
      Array.from({ length: 5 }, () => [expect.objectContaining({ provider_id: 'ssh:alpha' })])
    )
    expect([...durableSessions.values()]).toHaveLength(5)
  })
})
