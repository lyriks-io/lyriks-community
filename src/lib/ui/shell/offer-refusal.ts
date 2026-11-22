import { isUpgradePlan, PRICING_ADDRESS, PRICING_URL, type UpgradePlan } from '$domain/licensing';
import type { Toast } from '$ui/design-system';

/**
 * A refusal read as an offer (EVO-006). Where Community refuses what Solo
 * Builder opens, the server answers the sentence and the plan that opens it;
 * the page shows that sentence with View plans, a link to the plans that opens
 * in a new tab, never the server's raw answer.
 */

/** What a refusal said: its sentence when the answer could be read, and the plan when it is an offer. */
export interface Refusal {
	readonly message: string | null;
	readonly plan: UpgradePlan | null;
}

/** The words of the link to the plans, on every offer. */
export const VIEW_PLANS = 'View plans';

const sentenceOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** A refusal from a body the server wrote (a JSON answer, or a form action's failure data). */
export function refusalIn(body: unknown): Refusal {
	if (!body || typeof body !== 'object') return { message: null, plan: null };
	const said = body as { refusal?: unknown; message?: unknown; error?: unknown; plan?: unknown };
	return {
		message: sentenceOf(said.refusal) ?? sentenceOf(said.message) ?? sentenceOf(said.error),
		plan: isUpgradePlan(said.plan) ? said.plan : null
	};
}

/**
 * A refused answer, read. Only a JSON body is read: anything else (a web page,
 * a stack, nothing) leaves the message empty, so the page says what did not
 * happen, alone.
 */
export async function readRefusal(res: Response): Promise<Refusal> {
	const raw = await res.text().catch(() => '');
	try {
		return refusalIn(JSON.parse(raw));
	} catch {
		return { message: null, plan: null };
	}
}

/** Opens the plans in a new tab; the page the person is on stays as it was. */
export function openPlans(): void {
	window.open(PRICING_URL, '_blank', 'noopener,noreferrer');
}

/**
 * The toast of an offer: the sentence with View plans as its action where the
 * installation allows links out (`page.data.onlineHelp`), otherwise the
 * address of the plans written after it, as text.
 */
export function offerToast(message: string, online: boolean): Omit<Toast, 'id' | 'count'> {
	return online
		? { level: 'info', message, action: { label: VIEW_PLANS, run: openPlans } }
		: { level: 'info', message: `${message} The plans: ${PRICING_ADDRESS}` };
}

/** What a project creation says when the server's answer cannot be read. */
export const PROJECT_NOT_CREATED = 'The project was not created.';

/**
 * What a refused act shows: the offer with View plans when the refusal names a
 * plan, else the server's sentence, else what did not happen (`failed`), alone.
 */
export async function refusalToast(res: Response, failed: string, online: boolean): Promise<Omit<Toast, 'id' | 'count'>> {
	const refusal = await readRefusal(res);
	if (refusal.plan && refusal.message) return offerToast(refusal.message, online);
	return { level: 'error', message: refusal.message ?? failed };
}
