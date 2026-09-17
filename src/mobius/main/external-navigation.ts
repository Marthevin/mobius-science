const BLOCKED_HOSTS = new Set(['aipoch.com', 'www.aipoch.com', 'statics.aipoch.com'])

const isOriginalProductUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()

    if (BLOCKED_HOSTS.has(host) || host.endsWith('.aipoch.com')) return true
    if (host === 'github.com' || host === 'raw.githubusercontent.com') {
      return path === '/aipoch' || path.startsWith('/aipoch/')
    }
    if (host === 'api.github.com') return path.startsWith('/repos/aipoch/')
    if (host === 'x.com') return path === '/aipoch_ai' || path.startsWith('/aipoch_ai/')
    if (host === 'discord.gg') return path === '/85dkfugm9'
    return false
  } catch {
    return false
  }
}

export { isOriginalProductUrl }
