export function getBackendConfig(): { url: string; key: string } | null {
  if (import.meta.env.VITE_SUPABASE_ENABLED !== 'true') return null
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    // A privileged server key must never be bundled into the player app.
    if (key.startsWith('sb_secret_')) return null
    if (key.startsWith('eyJ')) {
      const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (claims.role !== 'anon') return null
    } else if (!key.startsWith('sb_publishable_')) return null
    return { url: parsed.origin, key }
  } catch {
    return null
  }
}
