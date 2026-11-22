import { error, json } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { parseExpectedRevision, revisionConflictBody } from '$domain/implementation';
import type { IndexWriteOutcome } from '$application/use-cases';

/**
 * Every write of a project's implementation index (a sync, a move of lines, a
 * report) goes through one guard (feat-100, criteria fbe61ab1 and 93abb7df):
 * it answers the revision the write made, and refuses with 409 a write sent
 * against an older revision where a write since then touched what it sends.
 */

type Body = Readonly<Record<string, unknown>>;

/** The revision the caller wrote against: null when not given; anything else is a 400. */
export function expectedRevisionOf(value: unknown): number | null {
	const expected = parseExpectedRevision(value);
	if (expected === 'invalid') error(400, 'expectedRevision must be a whole number of 0 or more (the revision an earlier write answered)');
	return expected;
}

/**
 * Run a write under the project's revision guard: its answer with the
 * `revision` it leaves, or the 409 that names the units written since.
 */
export async function guardedIndexWrite(
	services: AppServices,
	projectId: string,
	units: readonly string[],
	expected: number | null,
	write: () => Promise<IndexWriteOutcome<Body>>
): Promise<Response> {
	const outcome = await services.guardIndexWrite.write(projectId, units, expected, write);
	if (outcome.kind === 'conflict') return json(revisionConflictBody(outcome.conflict), { status: 409 });
	return json({ ...outcome.value, revision: outcome.revision });
}
