import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import type { PersistedChatSession } from '../../shared/session-persistence'
import { ArtifactProvenanceFinalizationRecovery } from './provenance-finalization-recovery'

describe('artifact provenance finalization recovery', () => {
  it('does not load heavyweight execution snapshots while inspecting recovery candidates', async () => {
    const findMany = vi.fn(async (args?: { select?: Record<string, boolean> }) => {
      if (!args?.select || args.select.executionSnapshotJson !== undefined) {
        throw new Error('Recovery attempted to load heavyweight execution snapshots.')
      }
      return []
    })
    const recovery = new ArtifactProvenanceFinalizationRecovery({
      getClient: () =>
        Promise.resolve({ artifactVersion: { findMany } } as unknown as PrismaClient),
      compatibilityRepository: {
        listPendingRunPublications: vi.fn(async () => []),
        findRunFinalizationMarker: vi.fn(async () => undefined),
        finalizeRunArtifacts: vi.fn(async () => [])
      },
      messageFinalizer: {
        finalizeRunWithDurableSession: vi.fn(async () => []),
        activateFinalizedRunWithDurableSession: vi.fn(async () => [])
      }
    })
    const session: PersistedChatSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Recovery',
      cwd: '/workspace',
      status: 'idle',
      messages: [],
      createdAt: 1,
      updatedAt: 1
    }

    await expect(recovery.reconcileSession('project-1', 'session-1', session)).resolves.toEqual({
      recoveredVersionIds: [],
      recoveredMessageArtifacts: [],
      nativeFinalizationRunIds: [],
      unresolvedNativeFinalizationRunIds: []
    })
  })
})
