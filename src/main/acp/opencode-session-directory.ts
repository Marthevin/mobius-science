import { resolve } from 'node:path'

import type { AcpOpenCodeUsageApi } from './backend-generation-owner'

export type OpenCodeSessionDirectoryReconciliation = 'already-current' | 'moved' | 'unavailable'

export type OpenCodeSessionDirectoryResumePreparation =
  OpenCodeSessionDirectoryReconciliation | 'unsupported'

type OpenCodeSessionMetadata = {
  directory?: unknown
}

const loopbackUrl = (api: AcpOpenCodeUsageApi, path: string): URL =>
  new URL(path.replace(/^\//, ''), api.baseUrl.endsWith('/') ? api.baseUrl : `${api.baseUrl}/`)

// OpenCode binds a persisted Session to the directory stored in its own database. ACP
// session/resume accepts a cwd but does not rewrite that provider-owned directory, so a data-root
// move can appear to resume successfully and then fail on the first prompt. Reconcile through
// OpenCode's authenticated control-plane API before asking ACP to attach the Session.
export const reconcileOpenCodeSessionDirectory = async (
  api: AcpOpenCodeUsageApi,
  providerSessionId: string,
  cwd: string,
  fetchImpl: typeof fetch = fetch
): Promise<OpenCodeSessionDirectoryReconciliation> => {
  try {
    const sessionUrl = loopbackUrl(api, `/session/${encodeURIComponent(providerSessionId)}`)
    sessionUrl.searchParams.set('directory', cwd)
    const sessionResponse = await fetchImpl(sessionUrl, {
      headers: { authorization: api.authorization },
      signal: AbortSignal.timeout(2_000)
    })
    if (!sessionResponse.ok) return 'unavailable'

    const session = (await sessionResponse.json()) as OpenCodeSessionMetadata
    if (typeof session.directory !== 'string' || !session.directory.trim()) {
      return 'unavailable'
    }
    if (resolve(session.directory) === resolve(cwd)) return 'already-current'

    const moveResponse = await fetchImpl(
      loopbackUrl(api, '/experimental/control-plane/move-session'),
      {
        method: 'POST',
        headers: {
          authorization: api.authorization,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sessionID: providerSessionId,
          destination: { directory: cwd },
          moveChanges: false
        }),
        signal: AbortSignal.timeout(5_000)
      }
    )
    return moveResponse.ok ? 'moved' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
