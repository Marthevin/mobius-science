// Official transport locations only. Publisher metadata cannot choose download hosts.
export const OFFICIAL_SKILL_MARKETPLACE_SOURCE = {
  repository: 'mobius/disabled-skill-marketplace',
  ref: 'published',
  cdnBaseUrl: 'https://disabled.mobius.invalid/skill-marketplace/v1/'
} as const
