// A failed HTTP answer, turned into an error an agent can afford to read.
//
// Thrown errors do not pass through capResult, so whatever the message carries
// lands whole in the caller's context: a 404 on a route an older platform does
// not serve relayed its entire 145,000-character error page. The message keeps a
// short detail; the raw body stays on the error for the callers that parse a
// refusal out of it (apply_evolution_batch).

const DETAIL_MAX = 500
// A JSON error is something the platform wrote for its caller: a list of
// validation issues is worth more room than prose, and never reaches page size.
const JSON_DETAIL_MAX = 2000
const PAGE_EXCERPT = 200
// Fields that only restate the status: a body made of these says nothing its sentence does not.
const ENVELOPE_KEYS = new Set(['message', 'error', 'errors', 'status', 'statusCode', 'code', 'data', 'meta'])

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 3)}...`)
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The words of a web page. A readable excerpt, not sanitization: it only ever becomes error text. */
function pageText(html: string): string {
  return collapse(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
}

/** The sentence a JSON error body was written to carry, when it has one. */
function jsonMessage(parsed: Record<string, unknown>): string | null {
  for (const field of [parsed.message, parsed.error]) {
    if (typeof field === 'string' && field.trim()) return field
    if (isRecord(field) && typeof field.message === 'string' && field.message.trim()) return field.message
  }
  // The Back envelope: { errors: [{ code, message, field }] }.
  if (Array.isArray(parsed.errors)) {
    const messages = parsed.errors.flatMap((e) => (isRecord(e) && typeof e.message === 'string' ? [e.message] : []))
    if (messages.length) return messages.join('; ')
  }
  return null
}

/**
 * A JSON error body: its sentence when that is all it says, else the body
 * itself, because the fields next to the sentence (the issues of a failed
 * validation, the rows of a refusal) are what the caller acts on.
 */
function jsonDetail(text: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const sentence = jsonMessage(parsed)
  const onlySentence = sentence !== null && Object.keys(parsed).every((k) => ENVELOPE_KEYS.has(k))
  return onlySentence ? clip(collapse(sentence), DETAIL_MAX) : clip(collapse(text), JSON_DETAIL_MAX)
}

/**
 * A short detail for an error message: 500 characters at most, 2,000 for a
 * JSON body that carries more than a sentence.
 *  - a web page (the body starts with `<`, or the content type says markup):
 *    its first 200 characters of visible text, and what a page means here;
 *  - JSON that only carries a `message` or `error`: that sentence;
 *  - any other JSON: the body, so the issues next to the sentence survive;
 *  - anything else: the body, whitespace collapsed.
 */
export function errorDetail(body: string, contentType?: string | null, status?: number): string {
  const text = body.trim()
  if (text.startsWith('<') || /\b(html|xml)\b/i.test(contentType ?? '')) {
    const meaning = status === undefined || status === 404 || status === 405
      ? 'the platform answered with a web page, so this route probably does not exist on this platform version'
      : 'the platform answered with a web page instead of JSON'
    return clip(`${clip(pageText(text), PAGE_EXCERPT)} [${meaning}]`, DETAIL_MAX)
  }
  return jsonDetail(text) ?? clip(collapse(text), DETAIL_MAX)
}

/** `message` is sized for an agent's context; `body` is the untouched answer. */
export class HttpStatusError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message)
    this.name = 'HttpStatusError'
  }
}

/** Build the error of a failed response: `<prefix> <status> on <METHOD> <path><note>: <detail>`. */
export function httpStatusError(prefix: string, status: number, method: string, path: string, body: string, contentType?: string | null, note = ''): HttpStatusError {
  return new HttpStatusError(`${prefix} ${status} on ${method} ${path}${note}: ${errorDetail(body, contentType, status)}`, status, body)
}
