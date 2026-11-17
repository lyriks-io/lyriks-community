import type { DataRuleVerdict, DataRulesReading } from '$application/use-cases';

/**
 * The browser side of the data model's rules: the reading (instant), the
 * solver's verdicts (slow, asked apart) and the three actions that change what
 * the solver checks. Every answer is the server's; nothing is computed here.
 */

export type ReadingResult = { ok: true; reading: DataRulesReading } | { ok: false; error: string };
export type VerdictsResult = { ok: true; verdicts: readonly DataRuleVerdict[] } | { ok: false; error: string };
export type ActionResult = { ok: true } | { ok: false; error: string };

const failure = async (response: Response): Promise<string> => {
	const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
	return body?.error ?? body?.message ?? `The server answered ${response.status}.`;
};

export async function fetchReading(projectId: string): Promise<ReadingResult> {
	const response = await fetch(`/api/draft/data/rules?${new URLSearchParams({ projectId })}`);
	if (!response.ok) return { ok: false, error: await failure(response) };
	return { ok: true, reading: (await response.json()) as DataRulesReading };
}

export async function fetchVerdicts(projectId: string, quick = false): Promise<VerdictsResult> {
	const query = new URLSearchParams({ projectId, ...(quick ? { quick: '1' } : {}) });
	const response = await fetch(`/api/draft/data/rules/verdicts?${query}`);
	if (!response.ok) return { ok: false, error: await failure(response) };
	return { ok: true, verdicts: ((await response.json()) as { verdicts: DataRuleVerdict[] }).verdicts };
}

export async function postRuleAction(
	projectId: string,
	action:
		| { action: 'tie'; fieldId: string; statePath: string }
		| { action: 'untie'; fieldId: string }
		| { action: 'existence'; entityId: string; statePath: string | null }
): Promise<ActionResult> {
	const response = await fetch('/api/draft/data/rules', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ projectId, ...action })
	});
	if (!response.ok) return { ok: false, error: await failure(response) };
	return { ok: true };
}
