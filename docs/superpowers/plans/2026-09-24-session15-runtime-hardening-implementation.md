# Session 15 Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make full-text retrieval safe under proxy fake-IP DNS, repair Mobius identity and progress-language guidance on every primary turn, make the branded database filename the default, then integrate with the latest upstream `main` and certify an arm64 macOS package end to end.

**Architecture:** Keep downstream behavior under `src/mobius/`: a bounded DNS wire codec and destination verifier independently verify synthetic proxy DNS, while the existing full-text downloader remains the HTTP/TLS orchestrator. Add one Mobius-owned per-turn presentation fragment through the existing session-presentation seam, and change the Prisma helper default without removing the cold legacy migration path. Each subsystem lands as an independently testable commit before upstream rebase, package inspection, and GUI acceptance.

**Tech Stack:** TypeScript, Node.js `dns`/`https`/`tls`/`net`, Electron, Vitest, Prisma SQLite, electron-builder, Playwright/CUA on macOS.

**Spec:** `docs/superpowers/specs/2026-09-21-session15-runtime-hardening-design.md`

## Global Constraints

- Only a configured proxy plus an all-synthetic local result may enter independent DoH verification.
- Direct synthetic DNS, mixed local answers, IP literals, private/reserved results, and redirect targets that fail validation remain blocked.
- DoH connects through the configured proxy to the fixed Cloudflare numeric addresses on port 443 and validates TLS for `cloudflare-dns.com`; no local DNS or proxy-side hostname resolution bootstraps DoH.
- Publication transport uses only independently verified numeric addresses and validates TLS for the original publication hostname on every redirect.
- The primary-agent product identity is `Mobius Science Agent`; progress narration follows the latest user's conversational language and uses complete sentences, independently of artifact language.
- Legacy database, credential, and Electron-profile compatibility remains available for skipped-version upgrades; fresh clients default to `PRODUCT.databaseFileName`.
- Mobius additions live under `src/mobius/`; upstream files receive only imports, registration, and default-selection changes recorded in `mobius/upstream-touchpoints.json`.
- New renderer-visible copy, if needed, must be translated in all eight locales and pass `src/renderer/src/i18n/resources.test.ts`.
- The validation artifact is Apple-silicon, ad-hoc signed, not notarized, and named `mobius-science-0.33.0-mac-arm64.dmg` after the upstream version update.
- Do not push any branch or publish any artifact during this plan; remote publication requires a separate explicit instruction.

## Review Focus

- A fake-IP resolver that returns a synthetic IPv4 address and a non-synthetic IPv6 address must fail before any DoH or publication connection; Task 2 pins this with a mixed-answer test.
- A valid first publisher that redirects to a synthetic hostname whose DoH answer is private must fail before the second publication tunnel; Task 3 exercises the complete redirect boundary.
- DoH must not recurse through local fake-IP DNS or ask the proxy to resolve `cloudflare-dns.com`; Task 2 asserts that only fixed numeric resolver endpoints reach `tunnelThroughProxy`.
- A resumed OpenCode session with an installed persistent prompt must still receive the Mobius reminder exactly once, while reviewer turns receive none; Task 4 covers both paths.
- A skipped-version profile containing only `open-science.db` must still migrate, while a fresh `createProjectDbClient(root)` creates only `mobius-science.db`; Task 5 covers both authorities.

---

### Task 1: Establish the isolated execution baseline

**Files:**
- Verify: `package-lock.json`
- Verify: `docs/superpowers/specs/2026-09-21-session15-runtime-hardening-design.md`
- Runtime-only link: `node_modules` → `/Users/stephen/Geek/open-science/node_modules`

**Interfaces:**
- Consumes: clean branch `fix/session15-research-runtime` at committed design `0b101e48`.
- Produces: a reproducible test environment and a recorded baseline; no tracked source change.

- [ ] **Step 1: Verify branch isolation and dependency compatibility**

```bash
git status --short --branch
git diff --exit-code master...HEAD -- package-lock.json
test -x /Users/stephen/Geek/open-science/node_modules/.bin/vitest
```

Expected: the worktree is clean, the feature branch differs from `master` only by the design document, the lockfile is unchanged, and Vitest is installed in the original checkout.

- [ ] **Step 2: Reuse the matching ignored dependency tree in the worktree**

```bash
ln -s /Users/stephen/Geek/open-science/node_modules node_modules
```

Expected: `node_modules/.bin/vitest` is executable and `git status --short` remains empty because `node_modules` is ignored.

- [ ] **Step 3: Run the focused baseline**

```bash
npx vitest run src/main/literature/full-text-download.test.ts src/main/literature/full-text-proxy.test.ts src/main/acp/session-presentation-policy.test.ts src/mobius/main/project-database-identity.test.ts
```

Expected: record every pre-existing failure before edits. The known stale proxy user-agent assertion may expect `Open-Science/1.0` while production sends `MobiusScience/1.0`; keep that mismatch separate from the red-green assertions introduced below.

### Task 2: Add bounded DNS messages and synthetic-destination verification

**Files:**
- Create: `src/mobius/main/full-text-dns-message.ts`
- Create: `src/mobius/main/full-text-dns-message.test.ts`
- Create: `src/mobius/main/full-text-destination-verifier.ts`
- Create: `src/mobius/main/full-text-destination-verifier.test.ts`

**Interfaces:**
- Consumes: configured parent proxy URL, normalized publication hostname, `AbortSignal`, and the existing `tunnelThroughProxy(proxy, numericAddress, 443, undefined, signal)` API.
- Produces: `resolveFullTextDestination(input, dependencies?) => Promise<FullTextDestination>` where the result contains `mode: 'public' | 'synthetic'` and a non-empty, immutable array of validated numeric addresses.
- Produces: `FullTextDestinationError.reason` as either `unsafe-destination` or `synthetic-verification-failed`.

- [ ] **Step 1: Write failing DNS codec tests**

```ts
it('encodes one bounded IN question and accepts matching public A answers', () => {
  const query = encodeDnsQuery('journal.example', 1, 0x1234)
  expect(query.length).toBeLessThan(512)
  expect(decodeDnsResponse(publicAResponse, {
    id: 0x1234,
    hostname: 'journal.example',
    recordType: 1
  })).toEqual([{ address: '203.0.113.9', family: 4 }])
})

it.each(['transaction-id', 'question-name', 'question-type', 'cname-loop', 'oversized-message'])(
  'rejects an invalid %s response',
  (fixture) => expect(() => decodeDnsResponse(fixtures[fixture], expected)).toThrow()
)
```

- [ ] **Step 2: Run the codec tests to verify red**

```bash
npx vitest run src/mobius/main/full-text-dns-message.test.ts
```

Expected: FAIL because the codec module does not exist.

- [ ] **Step 3: Implement the bounded DNS wire contract**

```ts
type DnsRecordType = 1 | 28
type FullTextAddress = Readonly<{ address: string; family: 4 | 6 }>

const encodeDnsQuery = (hostname: string, recordType: DnsRecordType, id: number): Buffer => {
  // Emit one standard recursive IN question. Reject labels over 63 bytes, names over 253 bytes,
  // non-ASCII normalized names, and transaction ids outside uint16.
}

const decodeDnsResponse = (
  body: Buffer,
  expected: Readonly<{ id: number; hostname: string; recordType: DnsRecordType }>
): readonly FullTextAddress[] => {
  // Enforce a 64 KiB message bound, QR=1, opcode=0, TC=0, RCODE=0, one matching question,
  // bounded compression-pointer traversal, at most 128 records, and a loop-free CNAME chain.
  // Return only terminal A/AAAA records reachable from the requested owner name.
}
```

- [ ] **Step 4: Run the codec tests to verify green**

```bash
npx vitest run src/mobius/main/full-text-dns-message.test.ts
```

Expected: PASS with malformed, truncated, mismatched, looped, and oversized fixtures rejected.

- [ ] **Step 5: Write failing destination-verifier tests**

```ts
it('uses independent DNS only for an all-synthetic proxy result', async () => {
  const result = await resolveFullTextDestination(
    { hostname: 'journal.example', proxy: new URL('socks5://127.0.0.1:1086'), signal },
    {
      lookupAll: async () => [{ address: '198.18.1.7', family: 4 }],
      queryPublicDns: async () => [{ address: '93.184.216.34', family: 4 }]
    }
  )
  expect(result).toEqual({
    mode: 'synthetic',
    addresses: [{ address: '93.184.216.34', family: 4 }]
  })
})

it('rejects mixed public, private, and synthetic local answers without calling DoH', async () => {
  const queryPublicDns = vi.fn()
  await expect(resolveFullTextDestination(input, {
    lookupAll: async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '198.18.1.7', family: 4 }
    ],
    queryPublicDns
  })).rejects.toMatchObject({ reason: 'unsafe-destination' })
  expect(queryPublicDns).not.toHaveBeenCalled()
})
```

- [ ] **Step 6: Run verifier tests to verify red**

```bash
npx vitest run src/mobius/main/full-text-destination-verifier.test.ts
```

Expected: FAIL because the verifier is not implemented.

- [ ] **Step 7: Implement classification and fixed-address DoH transport**

```ts
const CLOUDFLARE_DOH_ADDRESSES = Object.freeze([
  { address: '1.1.1.1', family: 4 as const },
  { address: '1.0.0.1', family: 4 as const },
  { address: '2606:4700:4700::1111', family: 6 as const },
  { address: '2606:4700:4700::1001', family: 6 as const }
])

type FullTextDestination = Readonly<{
  mode: 'public' | 'synthetic'
  addresses: readonly FullTextAddress[]
}>

const resolveFullTextDestination = async (
  input: Readonly<{ hostname: string; proxy?: URL; signal: AbortSignal }>,
  dependencies: FullTextDestinationDependencies = defaultDependencies
): Promise<FullTextDestination> => {
  const local = normalizeAddresses(await dependencies.lookupAll(input.hostname))
  const state = classifyLocalAddresses(local)
  if (state === 'public') return immutableDestination('public', local)
  if (state !== 'synthetic' || !input.proxy) throw unsafeDestination()
  const independent = await dependencies.queryPublicDns(input.hostname, input.proxy, input.signal)
  if (!independent.length || independent.some(({ address }) => !isPublicFullTextAddress(address))) {
    throw syntheticVerificationFailed()
  }
  return immutableDestination('synthetic', independent)
}
```

The default `queryPublicDns` implementation must POST `/dns-query` separately for A and AAAA, tunnel only to the fixed numeric endpoints, set TLS SNI/Host to `cloudflare-dns.com`, reject redirects and non-`application/dns-message` responses, cap each body at 64 KiB, share the caller's abort/deadline signal, and send no cookie, referer, application credential, paper path, DOI, or research-specific user-agent.

`FullTextDestinationError` uses stable reasons plus distinct safe messages: `unsafe-destination` reports that the publication host resolved to a private or reserved destination; `synthetic-verification-failed` reports that the proxy uses synthetic DNS and Mobius Science could not independently verify a public destination. Neither message includes the original URL path or query.

- [ ] **Step 8: Run verifier and codec tests to verify green**

```bash
npx vitest run src/mobius/main/full-text-dns-message.test.ts src/mobius/main/full-text-destination-verifier.test.ts
```

Expected: PASS; test spies show no OS-DNS lookup for `cloudflare-dns.com`, no resolver hostname sent to the proxy, and no DoH call for public, direct-synthetic, or mixed local results.

- [ ] **Step 9: Commit the isolated verifier**

```bash
git add src/mobius/main/full-text-dns-message.ts src/mobius/main/full-text-dns-message.test.ts src/mobius/main/full-text-destination-verifier.ts src/mobius/main/full-text-destination-verifier.test.ts
git commit -m "feat(network): verify proxy fake IP destinations"
```

### Task 3: Pin verified destinations in full-text downloads and redirects

**Files:**
- Modify: `src/main/literature/full-text-download.ts`
- Modify: `src/main/literature/full-text-download.test.ts`
- Modify: `src/main/literature/full-text-proxy.test.ts`
- Modify: `mobius/upstream-touchpoints.json`

**Interfaces:**
- Consumes: `resolveFullTextDestination` and `FullTextDestinationError` from Task 2.
- Produces: the existing `downloadFullText(...) => Promise<Buffer>` API with unchanged call sites and progress semantics.

- [ ] **Step 1: Extend proxy tests with failing synthetic and redirect cases**

```ts
it('downloads through a fake-IP proxy using only independently verified addresses', async () => {
  fixture.lookup.mockResolvedValue([{ address: '198.18.2.4', family: 4 }])
  fixture.queryPublicDns.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  await expect(downloadFullText(PDF_URL, 100, undefined, resolveProxy)).resolves.toEqual(PDF)
  expect(fixture.tunnel).toHaveBeenLastCalledWith(
    expect.any(URL), '93.184.216.34', 443, undefined, expect.any(AbortSignal)
  )
})

it('revalidates a synthetic redirect and blocks its private independent answer', async () => {
  fixture.responses.push(redirect('https://redirect.example/paper.pdf'))
  fixture.queryPublicDns.mockResolvedValueOnce([{ address: '10.0.0.8', family: 4 }])
  await expect(downloadFullText(PDF_URL, 100, undefined, resolveProxy)).rejects.toMatchObject({
    reason: 'synthetic-verification-failed'
  })
  expect(fixture.publicationTunnels).toHaveLength(1)
})
```

- [ ] **Step 2: Run integration tests to verify red**

```bash
npx vitest run src/main/literature/full-text-download.test.ts src/main/literature/full-text-proxy.test.ts
```

Expected: new fake-IP success and unsafe-redirect tests FAIL while existing direct public behavior remains unchanged.

- [ ] **Step 3: Replace inline lookup policy with the Mobius verifier**

```ts
const destination = await resolveFullTextDestination({
  hostname: target.hostname,
  ...(proxy ? { proxy: new URL(proxy) } : {}),
  signal
})

const socket = await connectThroughValidatedAddresses(
  destination.addresses,
  (address) => tunnelThroughProxy(new URL(proxy), address, 443, undefined, signal),
  (tunnel) => connectTls({ socket: tunnel, servername: target.hostname })
)
```

For direct HTTPS, provide Node's `lookup` callback from the same validated public set. For proxy HTTPS, try only the already validated numeric addresses, preserve `servername: target.hostname`, and allow no hostname-based CONNECT/SOCKS request. Keep the existing five-redirect cap, 60-second combined deadline, PDF size enforcement, rate-limit handling, progress callbacks, and header allowlist.

- [ ] **Step 4: Correct the stale branded user-agent assertion and touchpoint description**

```ts
expect(fixture.requests.mock.calls[0][1].headers).toEqual({
  Accept: 'application/pdf',
  'User-Agent': 'MobiusScience/1.0'
})
```

Update the `src/main/literature/full-text-download.ts` touchpoint seam to describe both the downstream HTTP identity and registration of the Mobius destination verifier.

- [ ] **Step 5: Run all full-text tests to verify green**

```bash
npx vitest run src/main/literature/full-text-download.test.ts src/main/literature/full-text-proxy.test.ts src/main/literature/full-text-download-progress.test.ts src/main/literature/full-text-finder.test.ts
```

Expected: PASS for direct/proxied public DNS, synthetic proxy DNS, mixed/private rejection, cancellation, timeout, retry-after, redirect revalidation, progress, and PDF size limits.

- [ ] **Step 6: Commit full-text integration**

```bash
git add src/main/literature/full-text-download.ts src/main/literature/full-text-download.test.ts src/main/literature/full-text-proxy.test.ts mobius/upstream-touchpoints.json
git commit -m "fix(literature): pin verified fake IP destinations"
```

### Task 4: Enforce Mobius identity and conversational-language progress every turn

**Files:**
- Create: `src/mobius/main/turn-presentation-reminder.ts`
- Create: `src/mobius/main/turn-presentation-reminder.test.ts`
- Modify: `src/main/acp/session-presentation-policy.ts`
- Modify: `src/main/acp/session-presentation-policy.test.ts`
- Modify: `mobius/upstream-touchpoints.json`

**Interfaces:**
- Consumes: primary/reviewer role and the existing `turnPromptReminders` presentation input.
- Produces: `mobiusTurnPresentationReminder(role): string | undefined`, injected exactly once on every primary turn, including resumed provider sessions with a persistent system prompt.

- [ ] **Step 1: Write failing reminder contract tests**

```ts
it('separates conversational language from requested artifact language', () => {
  const reminder = mobiusTurnPresentationReminder('primary')!
  expect(reminder).toContain('Mobius Science Agent')
  expect(reminder).toContain("latest user's conversational language")
  expect(reminder).toContain('artifact language is independent')
  expect(reminder).toContain('complete natural sentences')
})

it('omits the reminder outside the primary role', () => {
  expect(mobiusTurnPresentationReminder('reviewer')).toBeUndefined()
})
```

- [ ] **Step 2: Run reminder tests to verify red**

```bash
npx vitest run src/mobius/main/turn-presentation-reminder.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the Mobius-owned presentation fragment**

```ts
const MOBIUS_TURN_PRESENTATION_REMINDER = [
  '<mobius_turn_presentation>',
  'Your product identity is Mobius Science Agent. Never identify yourself as Open Science, Open-Science, or OpenScience.',
  "Write every user-visible progress update before or between tool calls in the latest user's conversational language.",
  'The requested artifact language is independent: keep progress in the conversational language while writing the artifact in the language the user requested.',
  'Progress updates must be complete natural sentences with terminal punctuation, not headings or fragments ending in a colon.',
  'Do not translate code, raw tool output, exact identifiers, filenames, citations, or scientific values.',
  '</mobius_turn_presentation>'
].join('\n')

const mobiusTurnPresentationReminder = (
  role: SessionCapabilityPolicy['role'] = 'primary'
): string | undefined => (role === 'primary' ? MOBIUS_TURN_PRESENTATION_REMINDER : undefined)
```

- [ ] **Step 4: Write failing new/resumed session-presentation tests**

```ts
it.each([
  ['new', undefined],
  ['resumed', 'Baked OpenCode instructions.']
])('injects the Mobius reminder once for a %s OpenCode turn', (_kind, persistentSystemPrompt) => {
  const prefix = policy.buildTurnPromptPrefix({
    framework: opencodeFramework,
    tooling,
    persistentSystemPrompt
  })!
  expect(prefix.match(/<mobius_turn_presentation>/g)).toHaveLength(1)
  expect(prefix).toContain('Mobius Science Agent')
})
```

- [ ] **Step 5: Inject the reminder through the existing turn seam**

```ts
const productReminder = mobiusTurnPresentationReminder(input.role)
const setup = input.framework.buildSessionSetup({
  systemPromptAppends: input.sessionSetupPromptPrefix ? [] : this.systemPromptAppends(input),
  turnPromptReminders: [
    ...(productReminder ? [productReminder] : []),
    ...(input.turnPromptReminders ?? [])
  ],
  sessionOptions: input.sessionOptions
})
```

Do not alter provider message ids, stream chunk persistence, Notebook tool ordering, or renderer message coalescing.

- [ ] **Step 6: Run presentation and stream regressions**

```bash
npx vitest run src/mobius/main/turn-presentation-reminder.test.ts src/main/acp/session-presentation-policy.test.ts src/main/acp/runtime-prompt-composition.test.ts src/main/acp/session-update-projector.test.ts
```

Expected: PASS; both new and resumed primary turns contain one reminder, reviewer turns contain none, and existing stream/event tests remain unchanged.

- [ ] **Step 7: Commit presentation behavior**

```bash
git add src/mobius/main/turn-presentation-reminder.ts src/mobius/main/turn-presentation-reminder.test.ts src/main/acp/session-presentation-policy.ts src/main/acp/session-presentation-policy.test.ts mobius/upstream-touchpoints.json
git commit -m "fix(agent): reinforce Mobius turn presentation"
```

### Task 5: Make the branded database filename the default without removing migration safety

**Files:**
- Modify: `src/main/projects/prisma-client.ts`
- Modify: `src/mobius/main/project-database-identity.test.ts`
- Verify unchanged: `src/mobius/main/project-database-identity.ts`
- Verify unchanged: `mobius/config/product.json`

**Interfaces:**
- Consumes: `PRODUCT.databaseFileName`, explicit `databaseFile` overrides, and the existing `migrateLegacyProjectDatabase` startup path.
- Produces: `createProjectDbClient(configRoot, databaseFile = PRODUCT.databaseFileName)`; old-database fixtures pass `PRODUCT.legacyDatabaseFileNames[0]` explicitly.

- [ ] **Step 1: Write a failing fresh-client test and make the legacy fixture explicit**

```ts
it('uses the branded filename when a caller creates a fresh Prisma client', async () => {
  const root = temporaryRoot()
  const client = createProjectDbClient(root)
  await migrateApplicationDatabase(client)
  await client.$disconnect()
  expect(existsSync(join(root, 'mobius-science.db'))).toBe(true)
  expect(existsSync(join(root, 'open-science.db'))).toBe(false)
})

const legacy = createProjectDbClient(root, PRODUCT.legacyDatabaseFileNames[0])
```

- [ ] **Step 2: Run the database identity tests to verify red**

```bash
npx vitest run src/mobius/main/project-database-identity.test.ts
```

Expected: the fresh-client assertion FAILS because the current default is `open-science.db`; the explicit legacy fixture continues to describe migration intent.

- [ ] **Step 3: Replace the helper default with product configuration**

```ts
const projectDatabasePath = (
  configRoot: string,
  databaseFile = PRODUCT.databaseFileName
): string => join(configRoot, databaseFile).replace(/\\/g, '/')

const createProjectDbClient = (
  configRoot: string,
  databaseFile = PRODUCT.databaseFileName
): PrismaClient => {
  const dbPath = projectDatabasePath(configRoot, databaseFile)
  return new PrismaClient({
    datasources: { db: { url: `file:${dbPath}?connection_limit=${PROJECT_DB_CONNECTION_LIMIT}` } }
  })
}
```

Remove `PROJECT_DB_FILE`. Keep `legacyDatabaseFileNames`, `resolveExistingProjectDatabasePath`, checkpoint/integrity verification, atomic rename, sidecar cleanup, credential aliases, and dual-authority fail-closed behavior unchanged.

- [ ] **Step 4: Run database and credential compatibility regressions**

```bash
npx vitest run src/mobius/main/project-database-identity.test.ts src/main/credential-identity/ciphertext-inventory.test.ts src/main/credential-identity/recovery.test.ts src/main/storage/provenance-migration-validation.test.ts
```

Expected: PASS for fresh branded creation, legacy-only migration, branded fast path, credential inventory, and conflicting-database recovery.

- [ ] **Step 5: Commit the database default**

```bash
git add src/main/projects/prisma-client.ts src/mobius/main/project-database-identity.test.ts
git commit -m "fix(storage): default clients to the Mobius database"
```

### Task 6: Run repository certification before integration

**Files:**
- Verify: all files changed by Tasks 2–5
- Verify: `mobius/upstream-touchpoints.json`
- Verify: `src/shared/i18n/locales/*.json` only if renderer-visible copy was introduced

**Interfaces:**
- Consumes: all implementation commits.
- Produces: a clean, reviewable feature branch proven by focused tests, type checking, architecture guards, and the affected suite.

- [ ] **Step 1: Run focused tests together**

```bash
npx vitest run src/mobius/main/full-text-dns-message.test.ts src/mobius/main/full-text-destination-verifier.test.ts src/main/literature/full-text-download.test.ts src/main/literature/full-text-proxy.test.ts src/main/literature/full-text-download-progress.test.ts src/main/literature/full-text-finder.test.ts src/mobius/main/turn-presentation-reminder.test.ts src/main/acp/session-presentation-policy.test.ts src/main/acp/runtime-prompt-composition.test.ts src/main/acp/session-update-projector.test.ts src/mobius/main/project-database-identity.test.ts
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 2: Run structural checks**

```bash
npm run typecheck
npm run check:mobius:touchpoints
npx vitest run src/renderer/src/i18n/resources.test.ts
```

Expected: TypeScript, touchpoint inventory, and locale guards PASS.

- [ ] **Step 3: Run affected regression selection**

```bash
npm run test:affected
```

Expected: all tests selected from the branch diff PASS. If the impact mapper reports a pre-existing unrelated failure, preserve its exact command/output and prove the changed modules independently before proceeding.

- [ ] **Step 4: Review the feature diff and commit only test-driven corrections**

```bash
git diff --check master...HEAD
git status --short
git log --oneline --decorate master..HEAD
```

Expected: no whitespace errors, no uncommitted tracked changes, and only the design plus the three subsystem commits.

### Task 7: Rebase local master onto the latest upstream and integrate the fix

**Files:**
- Git refs: `upstream/main`, `master`, `fix/session15-research-runtime`
- Temporary worktree: `/private/tmp/open-science-master-session15`

**Interfaces:**
- Consumes: certified feature branch and latest fetched `upstream/main`.
- Produces: local `master` containing upstream history plus the Session 15 fixes, with no remote push.

- [ ] **Step 1: Fetch upstream and inspect divergence**

```bash
git fetch upstream main
git rev-list --left-right --count master...upstream/main
git log --oneline --decorate -5 upstream/main
```

Expected: the fetched commit is recorded before any ref mutation.

- [ ] **Step 2: Create an isolated master worktree**

```bash
git worktree add /private/tmp/open-science-master-session15 master
ln -s /Users/stephen/Geek/open-science/node_modules /private/tmp/open-science-master-session15/node_modules
```

Expected: `master` is checked out only in the temporary worktree; the user's original checkout remains on its existing feature branch.

- [ ] **Step 3: Rebase master onto upstream main**

```bash
git rebase upstream/main
```

Run from `/private/tmp/open-science-master-session15`. Resolve conflicts by preserving upstream behavior first and reapplying only the downstream registrations recorded in `mobius/upstream-touchpoints.json`.

- [ ] **Step 4: Rebase the feature branch onto the updated master**

```bash
git rebase master fix/session15-research-runtime
```

Run from the feature worktree. Re-run the Task 6 focused command after every conflict resolution and before continuing the rebase.

- [ ] **Step 5: Fast-forward master to the rebased feature branch**

```bash
git merge --ff-only fix/session15-research-runtime
```

Run from the master worktree. Expected: a fast-forward only; no merge commit.

- [ ] **Step 6: Re-run certification on integrated master**

```bash
npm run typecheck
npm run check:mobius:touchpoints
npm run test:affected
```

Expected: all integrated checks PASS. Do not push `master` in this task.

### Task 8: Build, inspect, and exercise the arm64 Mobius client end to end

**Files:**
- Generated: `mobius/runtime/opencode/darwin/arm64/**`
- Generated: `mobius/runtime/default-envs/**`
- Generated: `dist/mobius-science-0.31.1-mac-arm64.dmg`
- Inspect: packaged `Mobius Science.app`

**Interfaces:**
- Consumes: integrated local `master`, available network for staging managed binaries/runtimes, and macOS GUI access.
- Produces: a locally testable ad-hoc-signed arm64 DMG plus captured CLI and GUI acceptance evidence.

- [ ] **Step 1: Stage managed OpenCode and Python/R runtime archives**

```bash
npm run stage:mobius:runtimes
```

Expected: the manifest contains exactly `python-3.12` and `r-4.4`, and the managed arm64 OpenCode executable is present and executable.

- [ ] **Step 2: Build the Mobius arm64 DMG**

```bash
npm run build:mobius:mac -- --arm64
```

Expected: `dist/mobius-science-0.31.1-mac-arm64.dmg` is created.

- [ ] **Step 3: Inspect package identity, resources, and signature**

```bash
hdiutil attach dist/mobius-science-0.31.1-mac-arm64.dmg -nobrowse
plutil -p "/Volumes/Mobius Science/Mobius Science.app/Contents/Info.plist"
codesign --verify --deep --strict --verbose=2 "/Volumes/Mobius Science/Mobius Science.app"
```

Expected: bundle id `com.mobius.science`, display name `Mobius Science`, current application/DMG/status-bar assets, managed OpenCode, micromamba, Python 3.12 and R 4.4 archives, no updater/upstream GitHub controls, and a valid ad-hoc signature.

- [ ] **Step 4: Launch with an isolated validation profile**

Use CUA to open the packaged app full-screen with an isolated user-data/storage root. Confirm startup reaches the workspace without a database or credential recovery gate and creates `mobius-science.db` only.

- [ ] **Step 5: Verify identity and language in a new primary session**

Send this Chinese prompt:

```text
请用中文说明你是谁，然后分两步检查 Notebook 环境。每一步工具调用前后的进度都使用完整中文句子；最终只把生成的测试报告写成英文。
```

Expected: all visible progress narration is complete Chinese, identity is Mobius Science Agent, no Open Science identity appears, and only the requested artifact is English.

- [ ] **Step 6: Verify managed Notebook and runtime resources**

Run a small Python cell importing the standard scientific stack, save a tiny figure as an Artifact, and inspect R 4.4 runtime readiness. Expected: the managed runtimes execute without an Agent configuration screen or external runtime installation.

- [ ] **Step 7: Verify fake-IP full-text success and SSRF rejection**

With the configured proxy returning `198.18.0.0/15`, download a known public open-access PDF. Confirm it appears in Literature Inbox. Then use the deterministic integration fixture to return a private independent answer and a private redirect; confirm both fail before a publication tunnel and expose the distinct safe failure reason.

- [ ] **Step 8: Resume the prior research flow**

Open or import a representative prior OpenCode session, submit a Chinese continuation that asks for an English report, and run one Notebook step. Expected: the resumed turn gets the same Chinese progress/English artifact split, tools remain ordered, no compact-related stall occurs, and prior files remain visible.

- [ ] **Step 9: Capture final evidence and cleanly unmount**

Capture screenshots for startup, Mobius identity, Notebook execution, Literature Inbox success, safe rejection, and final Artifact. Record DMG checksum, package path, commit hash, focused/affected test counts, and any residual limitation. Quit the app and detach the DMG without deleting the isolated validation profile until the user has reviewed the evidence.
