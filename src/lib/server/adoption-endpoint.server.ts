import { error, json, type RequestEvent } from '@sveltejs/kit';
import type { AdoptionResult } from '$application/ports';
import { requireProjectAccess } from './project-access.server';

/**
 * Turn one engine answer into an HTTP response, shared by every code → spec route.
 *
 * Three outcomes, three meanings:
 *  - `null`      → the engine subprocess is unreachable. 503; the platform runs
 *                  without it, so this is an outage of an optional capability.
 *  - `ok: false` → the engine REFUSED, and the reason is the answer (untraced
 *                  elements, a finalized analysis, a source over the cap). 200
 *                  with `ok:false`, mirroring `/api/behavior/apply`: an LLM must
 *                  read the reason and correct itself, which an opaque 4xx denies it.
 *  - `ok: true`  → the payload, relayed verbatim.
 */
export function adoptionJson(result: AdoptionResult | null): Response {
	return json(adoptionBody(result));
}

/** The body {@link adoptionJson} answers, for a route that adds to it (the index revision). */
export function adoptionBody(result: AdoptionResult | null): Readonly<Record<string, unknown>> {
	if (result === null) error(503, 'Behavior engine unavailable');
	if (!result.ok) return { available: true, ok: false, error: inLyriksTerms(result.error) };
	return { available: true, ok: true, ...withItemRefusalsInLyriksTerms(result.value) };
}

/**
 * A batch call (record_element_spans, stage_candidates) answers `ok` with one
 * `results` row per item, and a refused item carries the engine's own sentence:
 * those rows are put in Lyriks terms as well, or the refusal a client reads
 * most often points at a tool it does not have (criterion 8636a090).
 */
function withItemRefusalsInLyriksTerms(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	if (!Array.isArray(value.results)) return value;
	const results = value.results.map((row: unknown) => {
		if (!row || typeof row !== 'object' || typeof (row as { error?: unknown }).error !== 'string') return row;
		const refused = row as { error: string };
		return { ...refused, error: inLyriksTerms(refused.error) };
	});
	return { ...value, results };
}

const UNKNOWN_ELEMENT = /^No element "([^"]*)" in this feature\. Call get_feature to list element ids\.$/;

/**
 * What a span (or the element a candidate is accepted as) can point at: the
 * engine traces exactly the elements its FeatureElements enumeration lists, and
 * nothing else, whatever its element-type vocabulary also names (criterion 8636a090).
 */
const SPAN_TARGETS =
	'a surface, a state (by the id of its state definition), an action, a rule, an invariant, a transition, an event or an entity';

/** What exists in a feature but carries no span of its own. */
const SPANLESS_ELEMENTS =
	'effects (trace the action or the rule that holds the effect), parameters, exposures, scenarios, reachability goals, personas, resources, constants and acceptance criteria';

/**
 * The engine words its refusals for its own tools: through Lyriks, `get_feature`
 * does not exist, and "no element" misleads when the id names a parameter, a
 * scenario or a criterion, which exist but are not traced by span.
 */
export function inLyriksTerms(message: string): string {
	const unknown = UNKNOWN_ELEMENT.exec(message);
	if (!unknown) return message;
	return (
		`No element "${unknown[1]}" that a span or a candidate can point at in this feature. ` +
		`A span, and the element a candidate is accepted as, name ${SPAN_TARGETS} (their ids are in get_behavior_feature); ` +
		`${SPANLESS_ELEMENTS} carry no span of their own.`
	);
}

/** What a client does with seeded entries, through the Lyriks MCP (criterion 40dc3260). */
export const SEED_NEXT_STEP =
	"Write these under `index` in your repo's .unspa.json, then send them with sync_implementation_index: the keys of the features you touched are enough, each action or surface with all of its children.";

/** What `synced` is when the seed was asked to land the coverage itself. */
export const SEED_SYNCED =
	"The sync of the seeded entries, done by the server in the same call (its answer, with incomplete and orphans): the coverage has landed. Still write the entries into your repo's .unspa.json, the index that lives with the code.";

/**
 * A seed answer in Lyriks terms: the engine's hint names its own tool
 * (`sync_from_index`), which the Lyriks MCP does not have, and no platform
 * route is named to a client (criterion 40dc3260).
 */
export function seedAnswerInLyriksTerms(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
	const written = Array.isArray(value.writtenKeys) ? value.writtenKeys.length : Number(value.written ?? 0);
	return {
		...value,
		...(typeof value.hint === 'string'
			? { hint: written > 0 ? SEED_NEXT_STEP : 'Nothing seeded; pass overwrite:true to replace the entries your index already holds.' }
			: {}),
		semantics: {
			entries: SEED_NEXT_STEP,
			persisted: 'Nothing was written server-side: the index belongs to your checkout.'
		}
	};
}

/**
 * Authorize a source-scoped operation.
 *
 * The engine addresses sources by a globally unique id and resolves them across
 * the whole store, so `projectId` alone would let any authenticated caller read
 * or delete another project's attached code. Prove membership before acting:
 * list the project's own sources and require the id to be among them.
 */
export async function requireSourceAccess(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectId: string,
	sourceId: string,
	action: 'read' | 'write'
): Promise<void> {
	await requireProjectAccess(event, projectId, action);

	const listed = await event.locals.services.codeAdoption.listSources(projectId);
	if (listed === null) error(503, 'Behavior engine unavailable');
	if (!listed.ok) error(502, `Could not verify source ownership: ${listed.error}`);

	const sources = listed.value.sources;
	const owns =
		Array.isArray(sources) &&
		sources.some((s) => (s as { id?: unknown } | null)?.id === sourceId);
	if (!owns) error(404, 'Source not found in project');
}
