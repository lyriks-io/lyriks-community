// What the person's AI reports of the retrospecification it runs
// (feat-mcp-authoring criteria c50587fb, 8c9bfffe, 23397c95): that it received
// the prompt, so the person's page moves on by itself (feat-ai-session criterion
// a6f870af), the commit it read, so the next run reads only the delta, and what
// the code says of each change a person made by hand in the validated
// specification. Lyriks never reads the repository itself: the AI reports what
// git and the code say. A later run holds what it finds (feat-ai-session criterion
// 50b00229): it reports each difference in `changes`, says `finished`, and once a
// person sent it what was validated, says in `written` what each change became.
// A change a person rejected comes back under its id once reworked, or leaves the
// report in `withdrawn` when the person said it is not a change at all
// (feat-fb747-traceability criterion eb132bbd). A run that writes nothing as it
// reads also says the phase it reads (`phase`) and each feature it finished
// re-reading (`read`): what its preview on Mismatch follows (EVO-014, actions
// 83ba020b and ef746636 of feat-145).

import type { LyriksClient } from '../lyriks-client.js'

export interface RetrospecReadingArgs {
  project_id: string
  received?: boolean
  commit?: string
  repository?: string
  checks?: { anchor: string; says: 'same' | 'other'; code?: string; where?: string }[]
  changes?: { id: string; kind: 'new' | 'changed' | 'removed'; anchor?: string; dock?: string; title: string; proposed?: string; code?: string; where?: string }[]
  withdrawn?: string[]
  finished?: boolean
  written?: { change: string; elements: { anchor: string; title?: string }[] }[]
  phase?: string
  read?: string[]
}

const path = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/retrospec/reading`

/** Reporting nothing, it only reads where the run stands and the hand edits Code drift lists. */
export async function reportRetrospecReadingHandler(args: RetrospecReadingArgs, lyriks: LyriksClient): Promise<unknown> {
  const checks = args.checks ?? []
  const changes = args.changes ?? []
  const written = args.written ?? []
  const withdrawn = args.withdrawn ?? []
  const read = args.read ?? []
  if (!args.received && !args.commit && !args.finished && !args.phase && checks.length === 0 && changes.length === 0 && written.length === 0 && withdrawn.length === 0 && read.length === 0)
    return lyriks.get(path(args.project_id))
  return lyriks.post(path(args.project_id), {
    ...(args.received ? { received: true } : {}),
    ...(args.commit ? { commit: { sha: args.commit, ...(args.repository ? { repository: args.repository } : {}) } } : {}),
    ...(checks.length > 0 ? { checks } : {}),
    ...(changes.length > 0 ? { changes } : {}),
    ...(withdrawn.length > 0 ? { withdrawn } : {}),
    ...(written.length > 0 ? { written } : {}),
    ...(args.finished ? { finished: true } : {}),
    ...(args.phase ? { phase: args.phase } : {}),
    ...(read.length > 0 ? { read } : {}),
  })
}
