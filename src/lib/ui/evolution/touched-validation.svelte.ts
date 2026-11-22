import { invalidate } from '$app/navigation';
import { pushToast } from '$ui/design-system';
import { clientId } from '$ui/shell/live-sync.client';
import { refusalOf } from '$ui/shell/save-queue';
import { sectionSyncKey } from '$lib/shared/section-sync';
import { RETROSPEC_SECTION } from '$domain/retrospec';
import type { TouchedChoice, TouchedLine, TouchedReading } from '$domain/evolution';
import { applyEvolution } from './reading-api';

/** A line as the page shows it: its choice may read Validated now, before the next reading drops it. */
export type ShownLine = Omit<TouchedLine, 'choice'> & { readonly choice: TouchedChoice };

/**
 * The block Not validated in Knowledge on the page (EVO-003): its reading,
 * fetched for the person who reads, and the choices they make. Validate now is
 * the Specification 360°'s own validation, sent from this request; the other
 * choices are the request's operations. Every rule is the server's: a refusal
 * comes back as the sentence the spec wrote.
 */
export class TouchedValidationState {
	reading = $state<TouchedReading | null>(null);
	failed = $state(false);
	busy = $state(false);
	/** Elements validated now from this page: they read Validated until the next reading, which no longer lists them. */
	#validatedNow = $state<readonly string[]>([]);

	constructor(
		private readonly projectId: string,
		private readonly requestId: string
	) {}

	/** The lines as they read, each validated now reading Validated. */
	get lines(): ShownLine[] {
		return (this.reading?.lines ?? []).map((line) => (this.#validatedNow.includes(line.id) ? { ...line, choice: 'validated_now' as const } : line));
	}

	/** How many lines still wait for a choice. */
	get awaiting(): number {
		return this.lines.filter((line) => line.choice === 'none').length;
	}

	async load(): Promise<void> {
		try {
			const res = await fetch(`/api/evolution?projectId=${encodeURIComponent(this.projectId)}&requestId=${encodeURIComponent(this.requestId)}&part=knowledge`);
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as { knowledge?: TouchedReading };
			this.reading = body.knowledge ?? null;
			this.#validatedNow = this.#validatedNow.filter((id) => this.reading?.lines.some((l) => l.id === id));
			this.failed = false;
		} catch {
			this.failed = true;
		}
	}

	/** Validate now: the reader's own validation in Knowledge, given from this request (action 344ad4b5). */
	async validateNow(ids: readonly string[]): Promise<void> {
		if (ids.length === 0 || this.busy) return;
		this.busy = true;
		try {
			let res: Response;
			try {
				res = await fetch(`/projects/${encodeURIComponent(this.projectId)}/spec/validation`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
					body: JSON.stringify({ acts: ids.map((itemId) => ({ op: 'validate', itemId, fromRequest: this.requestId })) })
				});
			} catch {
				pushToast({ level: 'error', message: 'Your validation was not saved. Check your connection.' });
				return;
			}
			if (!res.ok) {
				pushToast({ level: 'error', message: `Your validation was not saved. ${await refusalOf(res, 'The validation failed.')}` });
				return;
			}
			this.#validatedNow = [...this.#validatedNow, ...ids];
			// Knowledge reads it at once on every page that shows it.
			void invalidate(sectionSyncKey(this.projectId, RETROSPEC_SECTION)).catch(() => {});
		} finally {
			this.busy = false;
		}
	}

	/** One of the request's choices, then the reading again. */
	async #choose(operation: Record<string, unknown>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			const saved = await applyEvolution(this.projectId, [{ ...operation, requestId: this.requestId }], { what: 'your choice' });
			if (saved) await this.load();
		} finally {
			this.busy = false;
		}
	}

	atLanding = (elementId: string) => this.#choose({ op: 'validate_at_landing', elementId });
	takeBack = (elementId: string) => this.#choose({ op: 'withdraw_landing_validation', elementId });
	allAtLanding = () => this.#choose({ op: 'validate_all_at_landing' });
}
