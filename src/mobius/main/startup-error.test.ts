import { afterEach, expect, it, vi } from 'vitest'
import { presentStartupError } from './startup-error'

afterEach(() => vi.restoreAllMocks())

it('reports headless startup failure to stderr without opening a blocking dialog', () => {
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const showDialog = vi.fn()
  presentStartupError('PROJECT_DATABASE: conflicting-files', showDialog, [
    '--open-science-headless'
  ])
  expect(stderr).toHaveBeenCalledWith('PROJECT_DATABASE: conflicting-files')
  expect(showDialog).not.toHaveBeenCalled()
})

it.each([{ argv: [] }, { argv: ['--open-science-headless=true'] }])(
  'keeps ordinary startup error dialogs for $argv',
  ({ argv }) => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const showDialog = vi.fn()
    presentStartupError('Startup failed', showDialog, argv)
    expect(showDialog).toHaveBeenCalledOnce()
    expect(stderr).not.toHaveBeenCalled()
  }
)
