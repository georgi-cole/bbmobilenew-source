/** Build-time rollback for new preferences only. Legality, privacy and already
 * recorded decisions remain authoritative. No product-facing setting is added. */
export function strategicPreferencesEnabled(): boolean {
  return import.meta.env.VITE_STRATEGIC_PREFERENCES !== 'false'
}
