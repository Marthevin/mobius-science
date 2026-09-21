import { describe, expect, it } from 'vitest'

import { getFirstPartyToolDisplayName } from './first-party-tool-presentation'

const managedTools = [
  ['artifacts', 'write_artifact_file', 'Write file'],
  ['library', 'search_library', 'Literature library'],
  ['library', 'read_library_abstract', 'Literature library'],
  ['library', 'read_library_pdf', 'Literature library'],
  ['library', 'format_references', 'Literature library'],
  ['library', 'format_citation_document', 'Literature library'],
  ['library', 'prepare_latex_bundle', 'Literature library'],
  ['library', 'save_to_inbox', 'Literature library'],
  ['library', 'acquire_pdf', 'Literature library'],
  ['literature', 'read_document', 'Reading'],
  ['literature', 'list_pdf_elements', 'Reading'],
  ['literature', 'read_pdf_element', 'Reading'],
  ['plan', 'generate_plan', 'Plan control'],
  ['plan', 'update_step_status', 'Plan control']
] as const

describe('getFirstPartyToolDisplayName', () => {
  it.each(managedTools)('maps open_science_%s_%s to %s', (server, tool, displayName) => {
    expect(getFirstPartyToolDisplayName(`open_science_${server}_${tool}`)).toBe(displayName)
  })

  it.each([
    'mcp__open-science-library__search_library',
    'mcp__open_science_library__search_library',
    'mcp.open-science-library.search_library',
    'open-science-library/search_library',
    'open-science-library_search_library'
  ])('supports the managed provider identity form %s', (identity) => {
    expect(getFirstPartyToolDisplayName(identity)).toBe('Literature library')
  })

  it.each([
    'open_science_library_staging_search_library',
    'my_open_science_library_search_library',
    'open_science_library_unknown_tool',
    'search_library',
    'third-party/open-science-library/search_library',
    'bogus.open-science-library.search_library'
  ])('does not hide an unknown or lookalike provider identity %s', (identity) => {
    expect(getFirstPartyToolDisplayName(identity)).toBeUndefined()
  })
})
