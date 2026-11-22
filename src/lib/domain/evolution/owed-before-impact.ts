import type { EvolutionRequest } from './draft';
import { specStepsWritten } from './path';

/**
 * What a request owes before its Impact analysis (EVO-013): the Need's current
 * situation and objectives and the Solution's description, in the person's
 * words. What it changes is carried by its drafts. The Solution's examples, the
 * Functional spec and the Technical spec are offered, never owed: written when
 * the change needs them, by hand or by Prefill with my AI.
 */
export const OWED_BEFORE_IMPACT = ['00-need.situation', '00-need.objectives', 'step.solution.description'] as const;

/** Whether a text is one a request owes before its Impact analysis (criterion d4f176d4). */
export const isOwedBeforeImpact = (path: string): boolean => (OWED_BEFORE_IMPACT as readonly string[]).includes(path);

type Carried = Pick<EvolutionRequest, 'drafts' | 'dataDrafts' | 'sectionDrafts' | 'ruleDrafts' | 'findingDrafts'>;

/** Whether the request carries something that changes the product: a draft, or a data, page, rule or finding change. */
export const carriesAChange = (request: Carried): boolean =>
	request.drafts.length + request.dataDrafts.length + request.sectionDrafts.length + request.ruleDrafts.length + (request.findingDrafts ?? []).length > 0;

/**
 * An open request whose steps owe nothing and that carries a change: the
 * Impact analysis can read it, whether its Functional spec and its Technical
 * spec are written or not (criterion 80349d4a). A request that carries nothing
 * has nothing for the readings to read.
 */
export const readableAtImpact = (request: EvolutionRequest): boolean =>
	request.status === 'open' && specStepsWritten(request) && carriesAChange(request);
