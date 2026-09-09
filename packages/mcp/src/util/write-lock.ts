// Per-key write serialization for the section tools.
//
// Every section writer (set_section / patch_section / build_screen /
// wire_element / add_element / import_data_collections) does a read-modify-write
// of a whole section draft: two concurrent calls on the same project+section
// silently overwrite each other's changes (lost update), and the parallel heavy
// PUTs contend on the wizard app's save pipeline. Serializing per (projectId, section)
// makes concurrent MCP calls safe: they simply queue, order preserved, while
// writes to OTHER projects/sections still run in parallel.

const tails = new Map<string, Promise<unknown>>()

/** Run `fn` after every earlier writer of the same `key` has settled. */
export function withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve()
  // A failed predecessor must not poison the queue — only ordering matters.
  const run = prev.then(fn, fn)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  tails.set(key, tail)
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key)
  })
  return run
}
