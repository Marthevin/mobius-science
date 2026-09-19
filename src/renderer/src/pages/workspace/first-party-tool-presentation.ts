import { getNotebookToolDisplayName } from './notebook-tool-names'

type FirstPartyToolGroup = {
  server: string
  suffixes: readonly string[]
  displayName: string
}

// Product-facing names for the managed MCP tools. The transport identities remain unchanged for
// session replay and provider compatibility; only the renderer presentation passes through here.
const FIRST_PARTY_TOOL_GROUPS: readonly FirstPartyToolGroup[] = [
  {
    server: 'open-science-artifacts',
    suffixes: ['write_artifact_file'],
    displayName: 'Write file'
  },
  {
    server: 'open-science-library',
    suffixes: [
      'search_library',
      'read_library_abstract',
      'read_library_pdf',
      'format_references',
      'format_citation_document',
      'prepare_latex_bundle',
      'save_to_inbox',
      'acquire_pdf'
    ],
    displayName: 'Literature library'
  },
  {
    server: 'open-science-literature',
    suffixes: ['read_document', 'list_pdf_elements', 'read_pdf_element'],
    displayName: 'Reading'
  },
  {
    server: 'open-science-plan',
    suffixes: ['generate_plan', 'update_step_status'],
    displayName: 'Plan control'
  }
]

const matchesNamespacedTool = (
  toolName: string,
  server: string,
  suffixes: readonly string[]
): boolean => {
  const name = toolName.trim().toLowerCase()
  if (!name) return false

  const segments = name.split(/__|\.|\//u)
  if (segments.length >= 2) {
    const suffix = segments[segments.length - 1]
    const serverSegment = segments[segments.length - 2].replace(/_/gu, '-')
    if (serverSegment === server && suffixes.includes(suffix)) return true
  }

  const flattenedServer = server.replace(/-/gu, '_')
  return suffixes.some(
    (suffix) => name === `${server}_${suffix}` || name === `${flattenedServer}_${suffix}`
  )
}

const getFirstPartyToolDisplayName = (
  ...toolNames: Array<string | undefined | null>
): string | undefined => {
  for (const toolName of toolNames) {
    const notebookName = getNotebookToolDisplayName(toolName)
    if (notebookName) return notebookName
    if (!toolName) continue

    for (const group of FIRST_PARTY_TOOL_GROUPS) {
      if (matchesNamespacedTool(toolName, group.server, group.suffixes)) return group.displayName
    }
  }

  return undefined
}

const isFirstPartyToolIdentity = (toolName: string | undefined | null): boolean =>
  getFirstPartyToolDisplayName(toolName) !== undefined

export { getFirstPartyToolDisplayName, isFirstPartyToolIdentity }
