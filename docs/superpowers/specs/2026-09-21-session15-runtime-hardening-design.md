# Session 15 Runtime Hardening Design

## Status

Approved in conversation on 2026-09-21 for specification. Implementation remains gated on review
of this document and the subsequent implementation plan.

## Context and intent

Mobius Science session 15 exposed four defects during an end-to-end digital mental-health research
workflow:

1. Full-text acquisition failed with `Full-text host did not resolve to a public address.` when the
   configured proxy used synthetic DNS addresses from `198.18.0.0/15`.
2. A resumed OpenCode conversation could still identify the product as Open Science even though the
   current product is Mobius Science.
3. Short assistant narration emitted between Notebook tool calls was written in English and as
   incomplete phrases while the user was conducting the research in Chinese and requesting only the
   final manuscript artifact in English.
4. The branded database filename migration left compatibility code whose continuing purpose and hot
   path cost needed to be reviewed.

The release must fix these behaviors on a branch created from `master@8a3c97fb`, preserve upstream
mergeability, and produce a locally testable Apple-silicon macOS DMG.

## Evidence from session 15

The persisted session contains separate, complete OpenCode assistant messages around Notebook tool
calls, followed by the final response. Examples include `Writing the manuscript package...` and
`Running the manuscript consistency and citation audits:`. Their text and event associations are
present in the session file. The observed defect is therefore the language and completeness of
model-authored progress narration, not dropped stream chunks. The message segmentation remains
unchanged.

The current user profile contains `mobius-science.db` and no `open-science.db`, showing that the
filename migration completed for this installation. The compatibility path performs bounded file
existence and type checks when the branded database already exists; it does not scan the database.

The current `master` already composes the new-session identity with `PRODUCT.displayName`. A resumed
provider conversation can nevertheless retain the old identity in its provider-native history, so
new-session branding alone does not correct session 15.

## Goals

- Download public full-text PDFs through fake-IP proxies without weakening SSRF destination checks.
- Keep every real private, loopback, link-local, metadata, reserved, mixed, malformed, and literal-IP
  destination blocked.
- Correct product identity and progress-language behavior in both new and resumed OpenCode sessions.
- Ensure new application databases use the branded filename by default while preserving safe
  upgrades from legacy installations.
- Deliver an ad-hoc-signed arm64 DMG that contains the managed OpenCode, Python, and R resources and
  launches successfully on the test Mac.
- Keep Mobius-specific additions physically isolated and minimize modifications to upstream-owned
  files.

## Non-goals

- Renaming internal protocol identifiers, MCP server names, database migration-table names, or
  `<open_science_...>` instruction tags. They are compatibility identifiers and are not product
  identity presented to users.
- Translating Notebook code, raw stdout/stderr, scientific values, filenames, citations, or an
  artifact whose language the user explicitly selected.
- Combining all assistant messages in one turn or hiding legitimate tool chronology.
- Removing support for installations that skip one or more Mobius Science versions.
- Notarizing or publicly distributing this validation build.

## Design overview

The changes form four independent units behind existing seams:

1. A full-text destination verifier distinguishes ordinary public DNS, synthetic proxy DNS, and
   unsafe DNS. Synthetic answers trigger an independent RFC 8484 DNS-over-HTTPS verification whose
   public numeric result is pinned for the actual proxy tunnel.
2. A small Mobius-owned per-turn presentation reminder repairs retained provider identity and makes
   conversational-language requirements explicit for every user-visible narration fragment.
3. Database client defaults move to the product manifest's branded filename. The cold legacy
   migration and credential/profile aliases remain intact.
4. Targeted regression tests, package inspection, and launch smoke tests certify the resulting DMG.

## Full-text network safety

### Threat model

Full-text URLs can originate from remote metadata providers, redirects, or an agent-supplied
`pdfUrl`; they must be treated as untrusted. An attacker must not be able to make the Electron main
process connect to localhost, the user's LAN, cloud metadata endpoints, or special-purpose address
ranges. The request carries no application cookies, provider credentials, or browser session state,
but unauthenticated network access and reachability probing remain security-sensitive.

`198.18.0.0/15` is an IANA special-purpose benchmarking range and is not globally reachable. A DNS
answer containing only addresses from that range proves only that a synthetic-DNS proxy is active;
it does not reveal the proxy's eventual destination. TLS hostname verification authenticates the
requested DNS identity, but it does not classify the hidden destination as public. Automatically
trusting an all-synthetic answer would therefore move the SSRF trust boundary into the local proxy
without an explicit user decision and is rejected by this design.

References:

- IANA IPv4 Special-Purpose Address Registry:
  <https://www.iana.org/assignments/iana-ipv4-special-registry/>
- OWASP SSRF Prevention Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>
- RFC 8484, DNS Queries over HTTPS: <https://www.rfc-editor.org/rfc/rfc8484.html>
- RFC 9110, HTTP Semantics: <https://www.rfc-editor.org/rfc/rfc9110.html>
- RFC 9325, Secure Use of TLS and DTLS: <https://www.rfc-editor.org/rfc/rfc9325.html>

### Resolution states

For each initial URL and every redirect target, the verifier normalizes and validates the URL before
performing DNS:

- The scheme must be HTTPS.
- The port must be empty or `443`.
- User information is forbidden.
- IP literals are forbidden, including bracketed and translated IPv6 forms.
- The normalized ASCII hostname must contain a dot and must not end in `.localhost`, `.local`, or
  `.internal`.

The complete local A/AAAA result is classified into exactly one state:

- `public`: at least one address exists and every returned address is globally routable under the
  existing IPv4/IPv6 special-purpose policy.
- `synthetic`: a proxy is configured, the input is a hostname, at least one address exists, and every
  address is in the supported fake-IP forms: `198.18.0.0/15`, IPv4-mapped IPv6 containing that range,
  or the Darwin IPv4-translatable representation already recognized by the Notebook sandbox.
- `unsafe`: empty, malformed, private, loopback, link-local, metadata, reserved, mixed
  public/private, or mixed synthetic/non-synthetic results.

`unsafe` always fails before opening a destination tunnel. `synthetic` without a configured proxy
also fails.

### Independent public-DNS verification

An all-synthetic proxy result triggers a Mobius-owned verifier using the logical endpoint
`https://cloudflare-dns.com/dns-query`. It sends separate A and AAAA queries as RFC 8484 POST bodies
with `Content-Type: application/dns-message` and `Accept: application/dns-message`. It sends no
Cookie, Referer, Accept-Language, application credential, original URL path, query string, DOI, or
user-agent identifying the user's research. Cloudflare documents that endpoint and POST wire-format
contract at
<https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/>.

The verifier bootstraps without consulting the local fake-IP DNS service: it connects through the
configured application proxy to Cloudflare's fixed numeric anycast resolver addresses on port 443,
while using `cloudflare-dns.com` as the TLS SNI, certificate reference identity, and HTTP Host. The
initial implementation uses the provider-published addresses `1.1.1.1`, `1.0.0.1`,
`2606:4700:4700::1111`, and `2606:4700:4700::1001`, trying only address families supported by the
proxy transport. The proxy receives a numeric resolver destination and is never asked to resolve
the resolver hostname. Cloudflare publishes these addresses at
<https://developers.cloudflare.com/1.1.1.1/ip-addresses/>.

The resolver destination is fixed product policy and is not derived from the full-text URL. A
resolver certificate must validate for `cloudflare-dns.com`; connection or validation failure is a
hard failure. The resolver may see the queried publication hostname; this is the explicitly
accepted privacy trade-off for automatic fake-IP compatibility. There is no silent fallback to a
second resolver, local DNS, or unverified proxy DNS.

The verifier rejects the response unless all of the following are true:

- HTTP status is 200 and the response media type is `application/dns-message`.
- The DNS transaction id, response bit, question name, question type, and response code are valid.
- CNAME processing terminates without a loop and stays within bounded record and message limits.
- At least one terminal A or AAAA address exists across the queries.
- Every returned terminal address is globally routable under the same special-purpose policy used
  for ordinary local DNS.

No DNSSEC `AD` bit is required because many publisher zones are unsigned. DoH supplies an independent
view and authenticated transport to the product-selected resolver; the application still validates
every returned address itself.

### Connection pinning

For ordinary `public` resolution, the existing locally resolved public addresses remain eligible.
For `synthetic` resolution, only the independently verified DoH addresses are eligible. The download
attempt connects the parent HTTP, HTTPS, SOCKS4, or SOCKS5 proxy to a selected numeric eligible
address on port 443. It never asks the parent proxy to resolve the publication hostname.

TLS runs through that tunnel with the original publication hostname as SNI and reference identity.
Certificate-chain and hostname validation remain enabled. The HTTP Host value and request URL retain
the original publication hostname. If an eligible address cannot connect, another address from the
same already-validated set may be tried; no new address may be introduced without a fresh
verification.

Every 301, 302, 303, 307, or 308 target restarts URL validation, proxy resolution, local DNS
classification, optional DoH verification, numeric pinning, and TLS verification. Redirects remain
capped at five. No validation result crosses hostname boundaries.

### Security assessment and residual risk

This design keeps the existing fail-closed boundary: neither a fake-IP answer nor a configured
proxy is treated as proof that a destination is public. Numeric connection pinning prevents DNS
rebinding between validation and connection, redirect revalidation prevents a public first hop from
authorizing a private later hop, and publication-host TLS validation prevents a resolver from
silently substituting an unrelated public server.

The remaining material risks are bounded and explicit:

- Cloudflare learns the publication hostname, while the configured proxy observes connections to
  Cloudflare and the publisher IP. No paper path, DOI, signed query, credential, or application state
  is sent to the resolver.
- A compromised resolver can return an attacker-controlled public IP, but a download still requires
  a certificate valid for the original publication hostname. A locally installed trust root can
  alter that guarantee in the same way it can for other application HTTPS traffic.
- Publishers intentionally reachable only at private addresses remain blocked. This can cause a
  false rejection, but it avoids turning literature download into LAN or metadata-service access.
- Fixed resolver addresses are an operational dependency. If they become unavailable or the
  provider changes them, the synthetic-DNS path fails closed until a reviewed product update changes
  the allowlist.

The design therefore adds a resolver-privacy dependency and an availability dependency, but does
not broaden the set of network addresses that untrusted publication URLs may cause the application
to contact.

### Failure and observability

Independent DNS timeout, malformed DNS, non-public answers, media-type mismatch, resolver redirect,
or resolver unavailability fails closed. DoH redirects are not followed; the endpoint is fixed by
product policy. The existing direct and proxy public-DNS paths do not depend on DoH.

Diagnostics use stable reasons and log the normalized hostname and resolution mode only. They never
log a signed download query string or DoH request body. User-facing failures distinguish:

- the publication host resolved to a private or reserved destination; and
- the proxy uses synthetic DNS but Mobius Science could not independently verify a public
  destination.

Any new display copy is translated in all eight renderer locales according to `AGENTS.md`.

### Rejected alternatives

- Treating `198.18.0.0/15` as public in proxy mode: the true destination stays invisible and the SSRF
  boundary silently moves to the proxy.
- Sending the publication hostname in HTTP CONNECT or SOCKS5 and trusting remote DNS: convenient,
  but it cannot prove that the proxy selected a public address.
- Requiring a user approval for every synthetic hostname: safer than automatic trust but repetitive
  for literature workflows and still delegates destination classification to the local proxy.
- Failing all synthetic DNS permanently: strongest and simplest, but it leaves the reported workflow
  broken for common proxy configurations.

## Product identity and progress language

### Product-owned prompt fragment

A new Mobius-owned module contains a compact turn-presentation reminder. Upstream-owned prompt
composition imports and appends this fragment at every primary-agent turn, including turns that
resume an existing provider session with a previously installed persistent system prompt. It does
not run for reviewer or other restricted roles unless those roles already emit user-visible progress
narration.

The reminder establishes these rules:

- The product identity is `Mobius Science Agent`; it must never self-identify as Open Science,
  Open-Science, or OpenScience.
- Every user-visible progress update before or between tool calls uses the conversational language
  of the latest user request.
- Requested artifact language is independent of conversational language. A Chinese request for an
  English manuscript produces Chinese progress narration and an English manuscript.
- Progress narration uses complete natural sentences with terminal punctuation. Fragments such as
  `Writing the manuscript package:` are forbidden.
- Exact-output contracts still control the final response, and raw tool output, code, identifiers,
  citations, filenames, and scientific values are never translated or rewritten.

The existing general response-language instruction remains. The per-turn fragment repairs retained
legacy provider context and emphasizes the distinction that session 15 exposed.

### Presentation behavior

OpenCode can emit several assistant messages in one user turn around tool calls. Those messages
continue to use provider message ids as stream ids so Notebook execution order, tool grouping,
branching, citations, artifacts, and persistence semantics remain stable. The renderer does not
translate provider text and does not concatenate messages across tool boundaries.

## Database compatibility and cleanup

### Retained compatibility

The following compatibility behavior remains because users may upgrade from an older build without
installing every intermediate version:

- `legacyDatabaseFileNames: ["open-science.db"]` in the product manifest.
- `resolveExistingProjectDatabasePath` for pre-Prisma credential inventory and migration validation.
- The checkpoint, integrity check, atomic rename, sidecar cleanup, and dual-database fail-closed logic
  in `migrateLegacyProjectDatabase`.
- Legacy credential-storage and Electron-profile aliases needed to decrypt and adopt existing user
  state.

Removing these paths would strand skipped-version upgrades and could reintroduce the missing-key and
decryption failures previously observed. Their branded-database startup cost is bounded to file
metadata checks; they do not read the 900 MB database when no legacy file exists.

### Cleanup

The generic Prisma client helper defaults to `PRODUCT.databaseFileName` instead of a local
`PROJECT_DB_FILE = "open-science.db"` constant. Production, package-validation staging, and new test
databases therefore create `mobius-science.db` unless a caller explicitly supplies a filename.

Tests that intentionally construct a legacy installation pass `open-science.db` explicitly. Runtime
code may mention the legacy name only through the product manifest and the migration module. No
startup receipt or additional migration marker is added because the existing existence check is
cheaper and less failure-prone than another mutable state file.

## Isolation and upstream maintenance

New product policy and DoH code lives under `src/mobius/`. Upstream-owned changes are limited to
small registration or injection seams in full-text download wiring, session prompt composition, and
the Prisma client default. Every touched upstream file is recorded in `mobius/upstream-touchpoints.json`.

The implementation does not alter upstream database migrations, Notebook event schemas, session
file formats, ACP protocol types, or network-sandbox permission semantics.

## Verification strategy

### Full-text unit and integration tests

Tests must prove:

- direct public DNS remains pinned and succeeds without calling DoH;
- proxied public DNS remains pinned and succeeds without calling DoH;
- direct synthetic DNS is rejected;
- proxied all-synthetic DNS calls the verifier and tunnels only to a DoH-verified numeric public IP;
- a DoH private, loopback, link-local, metadata, reserved, empty, malformed, mixed, or failed result
  opens no publication tunnel;
- mixed local public/synthetic/private answers are rejected before DoH;
- HTTP, HTTPS, SOCKS4, and SOCKS5 proxy transports receive only a validated numeric destination;
- TLS SNI and hostname verification use the publication hostname;
- each redirect receives independent validation and a safe first hop cannot authorize an unsafe
  second hop;
- DoH requests contain only the required headers and DNS body, enforce size/time bounds, reject
  redirects, and never include the publication path or query;
- DoH bootstrap never calls operating-system DNS, sends only a fixed numeric Cloudflare destination
  to the configured proxy, and validates TLS for `cloudflare-dns.com`;
- cancellation and the existing 60-second full-text deadline abort both DoH and PDF transport;
- cookies, authorization headers, and provider credentials are never forwarded.

### Identity and language tests

Prompt-composition tests must cover a new OpenCode session and a resumed session with an existing
setup prefix. Both receive the Mobius per-turn reminder exactly once. The generated prompt explicitly
covers a Chinese conversational request for an English artifact and complete progress sentences.
No Open Science product identity remains in executable identity prose.

Existing workspace streaming tests continue to prove lossless chunk persistence and ordering around
Notebook tool calls. No store or renderer merging behavior changes.

### Database tests

Tests must prove:

- `createProjectDbClient(root)` creates `mobius-science.db` and not `open-science.db`;
- an explicit legacy fixture still creates `open-science.db` for migration tests;
- a valid legacy database is checkpointed and atomically renamed without data loss;
- a branded database takes the fast path without checkpoint or rename work;
- coexisting legacy and branded authorities still fail closed;
- credential inventory can read either pre-migration or branded state.

### Repository checks

Run targeted red-green tests first, then the affected Vitest suites, the i18n guard when display copy
changes, `npm run typecheck`, and `npm run check:mobius:touchpoints`. Run the established broader
custom/rebase regression set before packaging.

## macOS packaging and acceptance

The validation artifact targets Apple silicon and remains ad-hoc signed with notarization disabled.
Before invoking the Mobius mac build, stage the managed OpenCode and default Python/R runtime
resources through the existing Mobius staging commands. Generate brand assets, build the renderer
and Electron application, and package with the Mobius electron-builder configuration.

Bundle inspection must verify:

- `CFBundleIdentifier` is `com.mobius.science` and the display name is `Mobius Science`;
- the application, Finder/DMG, Dock, and status-bar resources use the current Mobius icons;
- the managed arm64 OpenCode executable exists and is executable;
- micromamba plus the Python 3.12 and R 4.4 default-environment archives are present;
- no updater or upstream GitHub control is reintroduced;
- no new profile creates `open-science.db`;
- the app passes `codesign --verify --deep --strict` and launches to the workspace without a startup
  gate failure.

The delivered filename follows `mobius-science-0.31.1-mac-arm64.dmg`. This is a local validation build,
not a notarized public release.

## End-to-end acceptance scenarios

1. Resume session 15 and issue a Chinese research instruction that requests an English scientific
   artifact. Every visible progress message is a complete Chinese sentence, the artifact remains
   English, and the assistant identifies itself only as Mobius Science when identity is relevant.
2. Download a public full-text PDF while the configured proxy returns `198.18.0.0/15`. Mobius obtains
   an independent public address, pins that numeric address through the proxy, validates the
   publication hostname with TLS, verifies the PDF signature, and saves the Literature Inbox item.
3. Repeat with a DoH answer containing any private or reserved address and with a redirect to a
   private target. Both fail before the publication tunnel opens and display the localized safety
   reason.
4. Start from a fresh profile and observe only `mobius-science.db`. Start from a valid legacy-only
   profile and observe one successful atomic migration with no data loss. A profile containing both
   databases remains blocked for explicit recovery.
5. Install the generated DMG, launch the packaged client, start a new session, run a small managed
   Python Notebook cell, inspect the managed R runtime status, and confirm the workspace and branding
   remain visually consistent.

## Rollback

The four units are independently revertible. Reverting fake-IP compatibility restores the current
fail-closed download behavior. Reverting the per-turn reminder affects presentation only. Reverting
the Prisma default requires retaining the legacy migration module so a validation build cannot
create two authoritative databases. Package artifacts are disposable and do not change the remote
release channel.
