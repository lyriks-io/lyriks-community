import { goto, invalidate } from '$app/navigation';
import { pushToast } from '$ui/design-system';
import { clientId } from '$ui/shell/live-sync.client';
import { refusalOf } from '$ui/shell/save-queue';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { NoticedPoint, NoticedState, NoticedTarget } from '$application/spec360/noticed';
import type { SpecEdits } from '../edits.svelte';

const without = <T>(record: Record<string, T>, key: string): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

/**
 * The decisions on the points Lyriks noticed, taken from a row or from its
 * drawer (criterion e0f69b3c): Reject keeps an issue as it is, New evolution
 * opens one request that names the point, Undo takes either back. Several
 * points are picked and composed into one evolution (criterion 3f977777): a
 * new request on them all, or added to a request still open to changes. Each
 * reads at once and is saved behind; a refusal puts the points back as they
 * stood and says why. The page's next read is the truth: what is shown at
 * once only lasts until it lands.
 */
export class FindingDecisions {
	#shown = $state<Record<string, NoticedState>>({});
	#busy = $state<Record<string, true>>({});
	/** The points picked to compose one evolution, by finding id. */
	picked = $state<ReadonlySet<string>>(new Set());

	constructor(
		private readonly projectId: string,
		private readonly edits: SpecEdits
	) {}

	stateOf(point: NoticedPoint): NoticedState {
		return this.#shown[point.finding.id] ?? point.state;
	}

	busy(point: NoticedPoint): boolean {
		return !!this.#busy[point.finding.id];
	}

	async #run(point: NoticedPoint, shown: NoticedState, save: () => Promise<boolean>): Promise<void> {
		const id = point.finding.id;
		if (this.#busy[id]) return;
		this.#busy = { ...this.#busy, [id]: true };
		this.#shown = { ...this.#shown, [id]: shown };
		await save().catch(() => false);
		// Saved or refused, the page read since (or the state before) is what shows from now on.
		this.#shown = without(this.#shown, id);
		this.#busy = without(this.#busy, id);
	}

	/** A point can be picked while it waits and a request can settle it. */
	canPick(point: NoticedPoint): boolean {
		return point.canEvolve && this.stateOf(point) === 'pending' && !this.busy(point);
	}

	isPicked(point: NoticedPoint): boolean {
		return this.picked.has(point.finding.id);
	}

	togglePick(point: NoticedPoint): void {
		const next = new Set(this.picked);
		if (!next.delete(point.finding.id)) next.add(point.finding.id);
		this.picked = next;
	}

	clearPicks(): void {
		this.picked = new Set();
	}

	/** Every point given that can be picked (action d43a7152): those already sent, rejected or that no request settles are left alone. */
	pickAll(points: readonly NoticedPoint[]): void {
		this.picked = new Set([...this.picked, ...points.filter((p) => this.canPick(p)).map((p) => p.finding.id)]);
	}

	/** The points given unticked, the others left as they are. */
	clearPicksOf(points: readonly NoticedPoint[]): void {
		const out = new Set(points.map((p) => p.finding.id));
		this.picked = new Set([...this.picked].filter((id) => !out.has(id)));
	}

	/** The picked points among those given, still pickable. */
	pickedOf(points: readonly NoticedPoint[]): NoticedPoint[] {
		return points.filter((p) => this.picked.has(p.finding.id) && this.canPick(p));
	}

	/** Two picked points or more are settled from the bar, so a line's own decisions wait (criterion e241c011). */
	composing(points: readonly NoticedPoint[]): boolean {
		return this.pickedOf(points).length >= 2;
	}

	/** Several points read at once as they will stand, saved in one batch; a refusal puts them all back. */
	async #runMany(points: readonly NoticedPoint[], shown: NoticedState, save: () => Promise<boolean>): Promise<void> {
		const ids = points.map((p) => p.finding.id).filter((id) => !this.#busy[id]);
		if (ids.length === 0) return;
		this.#busy = { ...this.#busy, ...Object.fromEntries(ids.map((id) => [id, true as const])) };
		this.#shown = { ...this.#shown, ...Object.fromEntries(ids.map((id) => [id, shown])) };
		this.picked = new Set([...this.picked].filter((id) => !ids.includes(id)));
		await save().catch(() => false);
		this.#shown = Object.fromEntries(Object.entries(this.#shown).filter(([id]) => !ids.includes(id)));
		this.#busy = Object.fromEntries(Object.entries(this.#busy).filter(([id]) => !ids.includes(id)));
	}

	/** One new request settling every picked point (ac-leaf-ac-cc-open-request), named after the point when it is one. */
	evolveMany(points: readonly NoticedPoint[]): Promise<void> {
		const picked = this.pickedOf(points);
		const findingIds = [...new Set(picked.flatMap((p) => p.finding.gapIds ?? []))];
		if (findingIds.length === 0) return Promise.resolve();
		const title = picked.length === 1 ? picked[0].finding.sheet.title || picked[0].finding.text : `Settle ${picked.length} points of What Lyriks noticed`;
		return this.#runMany(picked, 'sent', async () => {
			const written = await this.#evolution([{ op: 'open_request', findingIds, title, origin: 'technical_debt' }], 'The evolution was not opened.');
			const request = written?.requests?.[0];
			if (!request) return false;
			const href = request.href;
			pushToast({
				level: 'success',
				message: `${picked.length} ${picked.length === 1 ? 'point' : 'points'} sent to Evolutions${request.key ? `: ${request.key} opened` : ''}`,
				...(href ? { action: { label: 'Open', run: () => void goto(href) } } : {})
			});
			return true;
		});
	}

	/** Every picked point named on a request still open to changes (action Add findings to a request), no outcome chosen yet. */
	addTo(target: NoticedTarget, points: readonly NoticedPoint[]): Promise<void> {
		const picked = this.pickedOf(points);
		const findingIds = [...new Set(picked.flatMap((p) => p.finding.gapIds ?? []))];
		if (findingIds.length === 0) return Promise.resolve();
		const operations = findingIds.map((findingId) => ({ op: 'add_finding_draft', requestId: target.id, findingId }));
		return this.#runMany(picked, 'sent', async () => {
			const written = await this.#evolution(operations, `The points were not added to ${target.key}.`);
			if (!written) return false;
			pushToast({
				level: 'success',
				message: `${picked.length} ${picked.length === 1 ? 'point' : 'points'} added to ${target.key}`,
				action: { label: 'Open', run: () => void goto(target.href) }
			});
			return true;
		});
	}

	reject(point: NoticedPoint): Promise<void> {
		const issueId = point.finding.decision?.issueId;
		if (!issueId || !point.canReject) return Promise.resolve();
		return this.#run(point, 'rejected', async () => {
			const ok = await this.edits.keepFinding(issueId);
			if (ok) pushToast({ level: 'success', message: 'Point rejected: kept as it is' });
			return ok;
		});
	}

	evolve(point: NoticedPoint): Promise<void> {
		const findingIds = point.finding.gapIds ?? [];
		if (findingIds.length === 0 || !point.canEvolve) return Promise.resolve();
		return this.#run(point, 'sent', async () => {
			// Named after the point; a disagreement between the spec and the code is the product's own debt.
			const title = point.finding.sheet.title || point.finding.text;
			const written = await this.#evolution([{ op: 'open_request', findingIds, title, origin: 'technical_debt' }], 'The evolution was not opened.');
			const request = written?.requests?.[0];
			if (!request) return false;
			const href = request.href;
			pushToast({
				level: 'success',
				message: `Sent to Evolutions${request.key ? `: ${request.key} opened` : ''}`,
				...(href ? { action: { label: 'Open', run: () => void goto(href) } } : {})
			});
			return true;
		});
	}

	undo(point: NoticedPoint): Promise<void> {
		const state = this.stateOf(point);
		if (state === 'rejected') {
			const issueId = point.finding.decision?.issueId;
			if (!issueId) return Promise.resolve();
			return this.#run(point, 'pending', () => this.edits.reopenFinding(issueId));
		}
		const request = point.request;
		if (state !== 'sent' || !request?.undoable) return Promise.resolve();
		// A request opened on this point alone is cancelled, so it can be reopened from Evolutions; any other loses the point only.
		const operations = request.solo
			? [{ op: 'cancel_request', requestId: request.id, reason: 'The point it settles was taken back from What Lyriks noticed.' }]
			: request.findingIds.map((findingId) => ({ op: 'remove_finding_draft', requestId: request.id, findingId }));
		return this.#run(point, 'pending', async () => {
			const written = await this.#evolution(operations, 'The point was not taken back.');
			if (written) pushToast({ level: 'success', message: request.solo ? `${request.key} cancelled: the point is back to review` : `The point left ${request.key}: back to review` });
			return !!written;
		});
	}

	/** One batch of the Evolution section, applied whole or not at all. */
	async #evolution(operations: Record<string, unknown>[], failed: string): Promise<{ requests?: { key?: string | null; href?: string }[] } | null> {
		let res: Response;
		try {
			res = await fetch('/api/evolution', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
				body: JSON.stringify({ projectId: this.projectId, operations })
			});
		} catch {
			pushToast({ level: 'error', message: `${failed} Check your connection.` });
			return null;
		}
		const body = (await res
			.clone()
			.json()
			.catch(() => null)) as { results?: { ok: boolean; summary: string }[]; requests?: { key?: string | null; href?: string }[] } | null;
		const refused = body?.results?.find((r) => !r.ok);
		if (!res.ok || refused) {
			pushToast({ level: 'error', message: `${failed} ${refused?.summary ?? (await refusalOf(res, 'The change failed'))}` });
			return null;
		}
		await Promise.all([invalidate(projectSyncKey(this.projectId)), invalidate(sectionSyncKey(this.projectId, 'evolution'))]);
		return body;
	}
}
