import { askedWalks, type EvolutionRequest } from '$domain/evolution';

/**
 * The readings of the requests a landing told (EVO-005, action d632b48b):
 * their impact and their coherence run again on the specification as the
 * landing left it. Queued once the landing is written, never run inside it, so
 * a busy feature shared by many requests never slows the act that landed; one
 * batch per request, so a request whose readings cannot run never holds
 * another back. A reading that does not run leaves the Simulation saying it
 * reads the version before that landing, with Read again.
 */

/** The operations that read one request again: the walks it asks for, then the coherence check. */
export function readAgainOperations(request: Pick<EvolutionRequest, 'id' | 'drafts' | 'impactReport'>): Record<string, unknown>[] {
	return [
		...askedWalks(request).map((hypothesis) => ({ op: 'run_impact', requestId: request.id, hypothesis, depth: request.impactReport.depth })),
		{ op: 'run_coherence', requestId: request.id }
	];
}

type Run = (operations: readonly Record<string, unknown>[]) => Promise<{ readonly ok: boolean; readonly status?: number }>;

const inFlight = new Set<Promise<void>>();

/** Read the requests again in the background, each in its own batch; a batch another write raced is tried once more. */
export function readAgainInBackground(requests: readonly Pick<EvolutionRequest, 'id' | 'drafts' | 'impactReport'>[], run: Run): void {
	if (requests.length === 0) return;
	const work = (async () => {
		for (const request of requests) {
			const operations = readAgainOperations(request);
			const first = await run(operations).catch(() => null);
			if (first && !first.ok && first.status === 409) await run(operations).catch(() => null);
		}
	})();
	inFlight.add(work);
	void work.finally(() => inFlight.delete(work));
}

/** Resolves once every reading queued so far has run: what a caller that must read the result waits on. */
export async function readAgainSettled(): Promise<void> {
	while (inFlight.size > 0) await Promise.all([...inFlight]);
}
