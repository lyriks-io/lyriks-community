import { getContext, setContext } from 'svelte';
import { invalidate } from '$app/navigation';
import { pushToast } from '$ui/design-system';
import { clientId } from '$ui/shell/live-sync.client';
import { SaveQueue, refusalOf } from '$ui/shell/save-queue';
import { initials } from '$ui/team/team-style';
import { bringNextToValidate } from '$ui/evolution/evo-scroll';
import type { Stamp, ValidateControl, ValidateLook } from '$ui/evolution/BlockControls.svelte';
import { anchorDomId } from '$domain/discussions';
import { throughBadge } from './through-request';
import type { Baseline } from '$domain/baselines';
import { sectionSyncKey } from '$lib/shared/section-sync';
import {
	RETROSPEC_SECTION,
	SPEC360_TAB,
	applyRetrospecActs,
	canReviewElement,
	samePersonRef,
	specValidationBoard,
	type ElementStanding,
	type PersonRef,
	type RetrospecAct,
	type RetrospecDocument,
	type SpecElement,
	type SpecValidationBoard,
	type TeamMember
} from '$domain/retrospec';

/**
 * The validation of the Specification 360° on the page: the board read with
 * the same rules the server applies, each click marked as saving until
 * the saved document is read back (a refusal keeps the confirmed standing), the
 * stamps of every block, the reminders and the definitive validation
 * (VALIDATED and its celebration after confirmation); the decisions on the code changed
 * outside Lyriks are taken on the Code drift page (drift/drift-review.svelte.ts).
 * The acts are saved one after the other, in the order they were made.
 */

export interface ValidationSource {
	readonly projectId: string;
	readonly me: PersonRef;
	readonly canWrite: boolean;
	readonly teamAvailable?: boolean;
	readonly doc: RetrospecDocument;
	readonly elements: readonly SpecElement[];
	readonly team: readonly TeamMember[];
	readonly baselines: readonly Baseline[];
}

/** Send the validation's acts; true once saved and read back. `what` names, for the error toast, what was not saved. */
async function post(projectId: string, acts: readonly Record<string, unknown>[], what: string): Promise<boolean> {
	let res: Response;
	try {
		res = await fetch(`/projects/${encodeURIComponent(projectId)}/spec/validation`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
			body: JSON.stringify({ acts })
		});
	} catch {
		pushToast({ level: 'error', message: `${what} was not saved. Check your connection.` });
		return false;
	}
	if (!res.ok) {
		pushToast({ level: 'error', message: `${what} was not saved. ${await refusalOf(res, 'The validation failed')}` });
		return false;
	}
	// Our own write never echoes back on the live stream: read it ourselves. The baselines move only with the
	// definitive validation, so an element's validation reads back the validation alone (criterion c509fa9c).
	const keys = [RETROSPEC_SECTION, ...(acts.some((act) => act.op === 'publish') ? ['baselines'] : [])];
	try {
		await Promise.all(keys.map((key) => invalidate(sectionSyncKey(projectId, key))));
	} catch {
		pushToast({ level: 'error', message: `${what} was saved, but the page could not refresh. Reload to confirm it.` });
		return false;
	}
	return true;
}

let sequence = 0;

export class SpecValidation {
	readonly #source: () => ValidationSource;
	#pending = $state<{ readonly id: number; readonly acts: readonly RetrospecAct[] }[]>([]);
	readonly #queue = new SaveQueue();
	/** The celebration the definitive validation opens. */
	celebrating = $state(false);

	constructor(source: () => ValidationSource) {
		this.#source = source;
	}

	get source(): ValidationSource {
		return this.#source();
	}

	/** A pending request never changes the confirmed validation standing. */
	readonly doc = $derived.by(() => this.#source().doc);

	readonly board = $derived.by((): SpecValidationBoard => {
		const { elements, team, me, canWrite, baselines, teamAvailable } = this.#source();
		const board = specValidationBoard({ doc: this.doc, elements, team, viewer: canWrite ? me : null, baselines });
		return teamAvailable === false ? { ...board, complete: false } : board;
	});

	readonly draft = $derived(this.board.summary.state === 'draft');

	/**
	 * The board as it will read once the validations and withdrawals being saved are confirmed: what the band counts,
	 * so its count moves the moment one is sent and comes back if the server refuses it (criterion c509fa9c, EVO-007).
	 * The elements' own controls keep reading the confirmed board (criterion 3d83e291).
	 */
	readonly shownBoard = $derived.by((): SpecValidationBoard => {
		const acts = this.#pending.flatMap((p) => p.acts.filter((act) => act.op === 'validate' || act.op === 'clear_flag' || act.op === 'withdraw'));
		if (acts.length === 0) return this.board;
		const { elements, team, me, canWrite, baselines, teamAvailable } = this.#source();
		const outcome = applyRetrospecActs(this.doc, acts, { actor: me, now: new Date().toISOString(), reviewOnly: !canWrite });
		if (!outcome.ok) return this.board;
		const board = specValidationBoard({ doc: outcome.doc, elements, team, viewer: canWrite ? me : null, baselines });
		return teamAvailable === false ? { ...board, complete: false } : board;
	});

	element(anchor: string): SpecElement | undefined {
		return this.#source().elements.find((e) => e.id === anchor);
	}

	standing(anchor: string): ElementStanding | null {
		return this.board.standings[anchor] ?? null;
	}

	/** The element still waits on the reader's own validation. */
	waitsOnMe(anchor: string): boolean {
		const s = this.standing(anchor);
		const me = this.#source().me;
		return !!s && this.draft && s.missing.some((p) => samePersonRef(p, me));
	}

	mine(anchor: string): boolean {
		const me = this.#source().me;
		return !!this.standing(anchor)?.validatedBy.some((p) => samePersonRef(p, me));
	}

	canReview(anchor: string): boolean {
		const { doc, team, me, canWrite, teamAvailable } = this.#source();
		return teamAvailable !== false && canReviewElement(doc, this.element(anchor), team, me, canWrite);
	}

	saving(anchor: string): boolean {
		return this.#pending.some((pending) => pending.acts.some((act) => 'itemId' in act && act.itemId === anchor));
	}

	/** The Validate pill and the stamps of a block, or null when the block is not validated here. */
	control(anchor: string): ValidateControl | null {
		const s = this.standing(anchor);
		if (!s || !this.draft) return null;
		const { me, canWrite } = this.#source();
		const mine = this.mine(anchor);
		const saving = this.saving(anchor);
		const canReview = this.canReview(anchor);
		const look: ValidateLook = s.state === 'ok' ? 'done' : mine ? 'mine' : 'grey';
		const everyone = [...s.required, ...s.validatedBy.filter((p) => !s.required.some((r) => samePersonRef(r, p)))];
		// The reader first, never hidden in +N, so their own validation reads as theirs (criterion 8d6c8ec0).
		const people = [...everyone.filter((p) => samePersonRef(p, me)), ...everyone.filter((p) => !samePersonRef(p, me))];
		// Whose validation is still awaited (criterion aba60be7): the reader's while they are among the people it waits
		// on, or while it waits on nobody named and they may edit; else only the others', and nobody's once settled.
		const awaits = s.state === 'ok' ? null : this.waitsOnMe(anchor) || (s.required.length === 0 && canWrite && !mine) ? 'me' : 'others';
		// The reader's own pending initials validate like the check (criterion 8d6c8ec0); someone else's pending ones
		// send a reminder; validated initials only say who validated.
		const validateMine = canReview && !saving && !mine && awaits === 'me' ? () => void this.validate(anchor) : null;
		const what = this.element(anchor)?.title?.trim() || 'this element';
		const stamps: Stamp[] = people.map((p) => {
			const ok = s.validatedBy.some((v) => samePersonRef(v, p));
			const isMe = samePersonRef(p, me);
			const title = `${p.name} · ${ok ? 'validated' : isMe ? (validateMine ? 'click to validate' : 'to validate') : 'pending, click to send a reminder'}`;
			const onclick = ok ? null : isMe ? validateMine : !canWrite || saving ? null : () => void this.remind(anchor, p);
			// A click on initials is confirmed first (criterion 8d6c8ec0).
			const confirm = !onclick ? null : isMe ? { question: `Validate ${what}?`, act: 'Validate' } : { question: `Send a reminder to ${p.name}?`, act: 'Send' };
			return { id: p.id, initials: isMe ? 'YOU' : initials(p.name), title: isMe ? title.replace(p.name, 'You') : title, ok, onclick, name: p.name, me: isMe, confirm };
		});
		// Validated through the request that delivered it, which a person it waits on takes back (EVO-002).
		const through = s.through ? { ...throughBadge(this.#source().projectId, s.through), withdraw: canReview && !saving ? () => void this.withdrawThrough(anchor) : null } : null;
		return {
			through,
			look,
			held: this.#source().teamAvailable === false ? 'The project team is unavailable. Try again when it is available.' : null,
			title: saving ? 'Saving your validation' : mine ? 'You validated this element · click to withdraw' : 'Validate this element',
			run: !canReview || saving ? null : mine ? () => void this.withdraw(anchor) : awaits === 'me' ? () => void this.validate(anchor) : null,
			saving,
			withdraws: mine,
			// One click on the reader's own check asks first, then Withdraw takes it back (EVO-007, criterion 00d0d300).
			withdrawConfirm: mine ? { question: `Withdraw your validation of ${what}?`, act: 'Withdraw' } : null,
			stamps,
			settled: s.state === 'ok',
			awaits
		};
	}

	/**
	 * `refused` leads what the page refuses itself, as the server's refusal is led (`post`): a withdrawal says it was
	 * not saved before its reason (EVO-007).
	 */
	async #act(acts: RetrospecAct[], wire: Record<string, unknown>[], what = 'Your validation', refused = ''): Promise<boolean> {
		const refusal = this.#refusal(acts);
		if (refusal) {
			pushToast({ level: 'info', message: `${refused}${refusal}` });
			return false;
		}
		if (acts.some((act) => 'itemId' in act && this.saving(act.itemId))) return false;
		const id = ++sequence;
		this.#pending = [...this.#pending, { id, acts }];
		try {
			return await this.#queue.run(() => {
				const refusal = this.#refusal(acts);
				if (refusal) {
					pushToast({ level: 'info', message: `${refused}${refusal}` });
					return Promise.resolve(false);
				}
				return post(this.#source().projectId, wire, what);
			});
		} finally {
			this.#pending = this.#pending.filter((p) => p.id !== id);
		}
	}

	#refusal(acts: readonly RetrospecAct[]): string | null {
		const source = this.#source();
		if (source.teamAvailable === false) return 'The project team is unavailable. Try again when it is available.';
		if (!source.canWrite) {
			const ownReview = acts.length > 0 && acts.every((act) => {
				if (!('itemId' in act) || !this.canReview(act.itemId)) return false;
				return act.op === 'validate' || act.op === 'withdraw' || act.op === 'withdraw_request_validation' ||
					(act.op === 'clear_flag' && acts.some((other) => other.op === 'validate' && other.itemId === act.itemId));
			});
			if (!ownReview) return 'You can read this specification, not validate it: ask a project editor.';
		}
		for (const act of acts) {
			if (['validate', 'withdraw', 'withdraw_request_validation', 'reject', 'publish'].includes(act.op) && !this.draft) return 'The specification is already validated.';
			if ('itemId' in act && !this.element(act.itemId)) return 'This element is no longer in the specification. Reload the page.';
			if (act.op === 'validate' && !this.canReview(act.itemId)) return 'This question does not require your validation.';
			if (act.op === 'publish' && !this.board.complete) return 'Validate every element before validating the specification definitively.';
			if (act.op === 'remind' && !this.standing(act.itemId)?.missing.some((person) => samePersonRef(person, act.to))) return 'This person no longer has to validate this element.';
		}
		const outcome = applyRetrospecActs(source.doc, acts, { actor: source.me, now: new Date().toISOString(), reviewOnly: !source.canWrite });
		return outcome.ok ? null : outcome.reason;
	}

	#validateAct(anchor: string): RetrospecAct {
		const e = this.element(anchor);
		return { op: 'validate', itemId: anchor, title: e?.title ?? anchor, tab: SPEC360_TAB };
	}

	/**
	 * Validate one element (restoring it when it was rejected), then bring the next one waiting on the reader into
	 * view, unless the caller leads the reader itself (`bring: false`, a review walking its own order).
	 */
	validate(anchor: string, bring = true) {
		const restore: RetrospecAct[] = this.standing(anchor)?.rejected ? [{ op: 'clear_flag', itemId: anchor }] : [];
		const done = this.#act([...restore, this.#validateAct(anchor)], [{ op: 'validate', itemId: anchor }]);
		if (bring) bringNextToValidate(anchorDomId(anchor));
		return done;
	}

	/**
	 * Ask for a change on one element (criterion a4ef7658): it reads rejected at once, nobody's validation standing
	 * until it is validated again; a refusal puts it back and says why.
	 */
	reject(anchor: string) {
		const e = this.element(anchor);
		return this.#act([{ op: 'reject', itemId: anchor, title: e?.title ?? anchor, tab: SPEC360_TAB }], [{ op: 'reject', itemId: anchor }], 'Your change request');
	}

	/** Where a set of elements stands: validations got over needed, and how many are validated, waiting, to review. */
	progressOf(anchors: readonly string[], board: SpecValidationBoard = this.board): { pct: number; ok: number; waiting: number; todo: number; total: number } {
		let got = 0;
		let need = 0;
		const count = { ok: 0, waiting: 0, todo: 0 };
		for (const a of anchors) {
			const s = board.standings[a] ?? null;
			if (!s) continue;
			count[s.state]++;
			need += Math.max(1, s.required.length);
			got += s.required.length > 0 ? s.required.length - s.missing.length : s.state === 'ok' ? 1 : 0;
		}
		const total = count.ok + count.waiting + count.todo;
		return { pct: need > 0 ? Math.round((100 * got) / need) : 0, ...count, total };
	}

	/** The elements of a list still waiting on the reader, a rejected one left to an explicit decision. */
	waitingOnMe(anchors: readonly string[]): string[] {
		return anchors.filter((a) => this.waitsOnMe(a) && !this.standing(a)?.rejected && !this.saving(a));
	}

	/** Validate, in one batch, every element of a section still waiting on the reader, then move on from the section. */
	validateAll(anchors: readonly string[], sectionId: string) {
		const waiting = this.waitingOnMe(anchors);
		if (waiting.length === 0) return Promise.resolve(false);
		const done = this.#act(
			waiting.map((a) => this.#validateAct(a)),
			waiting.map((a) => ({ op: 'validate', itemId: a }))
		);
		void done.then((ok) => ok && pushToast({ level: 'success', message: `You validated ${waiting.length} ${waiting.length === 1 ? 'element' : 'elements'}` }));
		bringNextToValidate(sectionId);
		return done;
	}

	/**
	 * Validate everything of the whole specification (or of all its features,
	 * `scope: 'features'`) still waiting on the reader: read validated at once on
	 * the page, while the server picks the elements itself, so the request stays
	 * one act however large the spec is. `anchors` are the scope's elements.
	 */
	validateAllInSpec(anchors: readonly string[], sectionId: string, scope?: 'features') {
		const waiting = this.waitingOnMe(anchors);
		if (waiting.length === 0) return Promise.resolve(false);
		const done = this.#act(
			waiting.map((a) => this.#validateAct(a)),
			[scope ? { op: 'validate_waiting', scope } : { op: 'validate_waiting' }]
		);
		const of = scope === 'features' ? 'of the features' : 'of the specification';
		void done.then((ok) => ok && pushToast({ level: 'success', message: `You validated ${waiting.length} ${waiting.length === 1 ? 'element' : 'elements'} ${of}` }));
		bringNextToValidate(sectionId);
		return done;
	}

	/**
	 * Take back the reader's own validation (action 4f151e72). Refused or failed, it says Your withdrawal was not
	 * saved. with the reason, the check stays green and the band's count comes back (EVO-007).
	 */
	withdraw(anchor: string) {
		return this.#act([{ op: 'withdraw', itemId: anchor }], [{ op: 'withdraw', itemId: anchor }], 'Your withdrawal', 'Your withdrawal was not saved. ');
	}

	/**
	 * Take back the validation a landed change request gave the element (EVO-002): it stands on its people's
	 * validations alone again; a refusal puts it back as it was and says why.
	 */
	withdrawThrough(anchor: string) {
		return this.#act([{ op: 'withdraw_request_validation', itemId: anchor }], [{ op: 'withdraw_request_validation', itemId: anchor }], 'Your withdrawal');
	}

	async remind(anchor: string, person: PersonRef) {
		const e = this.element(anchor);
		const sent = await this.#act([{ op: 'remind', itemId: anchor, title: e?.title ?? anchor, to: person }], [{ op: 'remind', itemId: anchor, to: person.id }], `The reminder to ${person.name}`);
		if (sent) pushToast({ level: 'info', message: `Reminder sent to ${person.name}: it is in their notifications` });
	}

	async requestValidation(anchor: string, person: PersonRef): Promise<boolean> {
		const e = this.element(anchor);
		const sent = await this.#act(
			[{ op: 'request_validation', itemId: anchor, title: e?.title ?? anchor, to: person }],
			[{ op: 'request_validation', itemId: anchor, to: person.id }],
			`The validation request to ${person.name}`
		);
		if (sent) pushToast({ level: 'info', message: `Validation requested from ${person.name}` });
		return sent;
	}

	removeValidationRequest(anchor: string, person: PersonRef): Promise<boolean> {
		const e = this.element(anchor);
		return this.#act(
			[{ op: 'cancel_validation_request', itemId: anchor, title: e?.title ?? anchor, to: person }],
			[{ op: 'cancel_validation_request', itemId: anchor, to: person.id }],
			`The validation request to ${person.name}`
		);
	}

	/** True while the definitive validation is on its way: a second click sends nothing more. */
	readonly finalizing = $derived(this.#pending.some((p) => p.acts.some((a) => a.op === 'publish')));

	/**
	 * The server captures the baseline before the page celebrates the confirmed validation.
	 */
	async finalize(): Promise<boolean> {
		if (this.finalizing) return false;
		const team = this.#source().team.map((m) => m.person);
		const ok = await this.#act([{ op: 'publish', baselineId: null, notify: team }], [{ op: 'finalize' }], 'The definitive validation');
		this.celebrating = ok;
		if (ok) pushToast({ level: 'success', message: 'Specification validated · Changes is now available' });
		return ok;
	}
}

const KEY = Symbol('spec360-validation');
export const provideValidation = (v: SpecValidation) => setContext(KEY, v);
export const useValidation = () => getContext<SpecValidation>(KEY);
