/**
 * De-duplicate the per-save `coherenceIssues` advisory list across consecutive
 * MCP writes: lyriks recomputes and returns it on EVERY section save, so a batch of
 * 16 build_screen calls repeats "1 Core(s) have no Journey yet" 16 times. The
 * first occurrence (and every CHANGE) passes through untouched; an identical
 * repeat is collapsed to a count so the signal fires once instead of drowning
 * the transcript. In-memory per process — a restart simply re-surfaces them.
 */
const lastSignature = new Map<string, string>()

export function dedupeCoherenceIssues<T>(key: string, result: T): T {
  if (!result || typeof result !== 'object') return result
  const issues = (result as Record<string, unknown>).coherenceIssues
  if (!Array.isArray(issues) || issues.length === 0) {
    lastSignature.delete(key)
    return result
  }
  const signature = JSON.stringify(issues)
  if (lastSignature.get(key) === signature) {
    const { coherenceIssues: _repeated, ...rest } = result as Record<string, unknown>
    return {
      ...rest,
      coherenceIssuesUnchanged: `${issues.length} advisory(ies) unchanged since the previous write — re-read with get_section or change the model to see them again.`,
    } as T
  }
  lastSignature.set(key, signature)
  return result
}
