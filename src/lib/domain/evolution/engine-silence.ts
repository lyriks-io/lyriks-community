import type { ActContext, ActOutcome } from './acts';
import type { EvolutionRequest } from './draft';
import { record } from './history';

/*
 * What a reader of a request's drafts says when the engine did not answer their
 * replay (a timeout, a busy or restarted engine): nothing is derived from a
 * fallback; each reader keeps its last good result or refuses, and says so
 * (criteria c623df9c, 837e56b6, 39c8df88).
 */
const ENGINE_DID_NOT_ANSWER = 'The engine did not answer';

/** Why a report was not rebuilt (rules a540a11e, 9d958ddc). */
export const REPORT_NOT_REBUILT = `${ENGINE_DID_NOT_ANSWER}, so the implementation report was not rebuilt: it stands as last built.`;

/** Why the tests of the frozen version are not handed out (rule b10172f4). */
export const TESTS_NOT_PUT_TOGETHER = `${ENGINE_DID_NOT_ANSWER}, so the tests of the frozen version cannot be put together now.`;

/** Why a sync left a request's holdings as they were (rule f836d299). */
export const HOLDINGS_NOT_REREAD = `${ENGINE_DID_NOT_ANSWER}, so the index entries this request holds were not read again: they stay as they were.`;

/** What the Build card's log reads when a report was not rebuilt. */
export const REPORT_NOT_REBUILT_LOG = `Code not read again: ${REPORT_NOT_REBUILT}`;

/**
 * The report stands as last built, its lines, their decisions and its counts
 * untouched, and the Build card's log says why, once until something else is
 * logged: a run of syncs while the engine is silent does not repeat it.
 */
export function reportNotRebuiltAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	const said = request.history.at(-1)?.summary === REPORT_NOT_REBUILT_LOG;
	return {
		ok: true,
		request: said ? request : record(request, { id: ctx.newId(), type: 'code_read', summary: REPORT_NOT_REBUILT_LOG, actor: ctx.actor, at: ctx.at }),
		summary: REPORT_NOT_REBUILT
	};
}
