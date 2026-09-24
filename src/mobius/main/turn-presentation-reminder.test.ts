import { describe, expect, it } from 'vitest'
import { mobiusTurnPresentationReminder } from './turn-presentation-reminder'

describe('Mobius primary-turn presentation', () => {
  it('keeps progress in the conversational language when the artifact language differs', () => {
    const reminder = mobiusTurnPresentationReminder('primary')!
    expect(reminder).toContain('Mobius Science Agent')
    expect(reminder).toContain("latest user's conversational language")
    expect(reminder).toContain('artifact language is independent')
    expect(reminder).toContain('complete natural sentences')
  })

  it('does not inject primary narration rules into reviewer turns', () => {
    expect(mobiusTurnPresentationReminder('reviewer')).toBeUndefined()
  })
})
