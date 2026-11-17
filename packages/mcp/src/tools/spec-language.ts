import type { LyriksClient } from '../lyriks-client.js'

/**
 * The one language a project's spec is written in, as the platform reads it
 * (declared in its operating details, English otherwise). Every project read
 * carries it, so an AI client writes the prose of the model in that language
 * and never in the conversation's. A platform too old to answer leaves it out.
 */
export async function specLanguageOf(lyriks: LyriksClient, projectId: string): Promise<unknown> {
  try {
    return await lyriks.get(`/api/projects/${encodeURIComponent(projectId)}/language`)
  } catch {
    return undefined
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The project a read answered about, as the platform names it: a slug asked
 * directly is already the platform's id; otherwise the id the answer links to.
 */
function platformProjectId(answer: unknown, asked: string): string {
  if (!UUID.test(asked)) return asked
  const row = answer && typeof answer === 'object' ? (answer as Record<string, unknown>) : {}
  for (const key of ['kernel_project_id', 'source_project_id', 'id']) {
    if (typeof row[key] === 'string' && row[key]) return row[key] as string
  }
  return asked
}

/** `answer` with the project's language beside it, when the answer is an object. */
export async function withSpecLanguage(
  answer: unknown,
  lyriks: LyriksClient,
  projectId: string,
): Promise<unknown> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return answer
  const specLanguage = await specLanguageOf(lyriks, platformProjectId(answer, projectId))
  return specLanguage === undefined ? answer : { ...(answer as Record<string, unknown>), specLanguage }
}
