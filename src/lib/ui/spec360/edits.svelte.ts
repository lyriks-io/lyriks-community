import { getContext, setContext, tick } from 'svelte';
import { invalidate } from '$app/navigation';
import { page } from '$app/state';
import { confirmDialog, pushToast } from '$ui/design-system';
import { OptimisticActs } from '$ui/evolution/optimistic-acts.svelte';
import { clientId } from '$ui/shell/live-sync.client';
import { mintUuid } from '$ui/shell/mint-id';
import { SaveQueue, refusalOf } from '$ui/shell/save-queue';
import { NEW_CORE_NAME, NEW_FEATURE_NAME, NEW_USER_NAME, editShapeOf, editedFields, type EditShape } from '$application/spec360/edits';
import { NEW_NAME, type AddedKind } from '$application/spec360/add-elements';
import type { ProductClassification } from '$application/spec360/classification';
import type { OperationsTargetEdit } from '$application/spec360/operations-targets';
import { anchorDomId } from '$domain/discussions';
import { RETROSPEC_SECTION } from '$domain/retrospec';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { scrollMotion } from '$ui/shell/scroll-motion';

/**
 * Editing the Specification 360° in place, one element at a time: the pencil
 * opens the element's fields (its title, its description, its tags where the
 * page shows them), Save writes them into the section that holds them, Cancel
 * leaves everything as it was. Adding a user or a core feature opens the new
 * one to edit at once; deleting asks first.
 *
 * Every change reads on the page the moment it is made (the editor closes on
 * the new text, the new card is there, the deleted one is gone) and is saved
 * behind, one save after the other in the order of the acts; the page keeps
 * showing it until it has read the spec again. A refused save puts the page
 * back as it stood, says why, and reopens the editor on what was typed.
 */

/** Two lists of texts read the same: the same texts in the same order (a blank one just added counts; the save drops it). */
const sameTags = (a: readonly string[] | undefined, b: readonly string[] | undefined) => {
	const x = (a ?? []).map((s) => s.trim());
	const y = (b ?? []).map((s) => s.trim());
	return x.length === y.length && x.every((s, i) => s === y[i]);
};

export interface EditValues {
	readonly text: string;
	readonly desc?: string;
	readonly tags?: readonly string[];
	/** The product's market, industry, product type and form factors (the product's summary only). */
	readonly classification?: ProductClassification;
}

/** A user, a core feature or a feature added here and not read back yet: the page shows its card under this id. */
export interface AddedElement {
	readonly as: 'user' | 'core' | 'feature' | AddedKind;
	/** The core feature a feature was added to. */
	readonly coreId?: string;
	readonly id: string;
	readonly anchor: string;
	readonly name: string;
}

type ElementAct = { readonly kind: 'edit'; readonly values: EditValues } | { readonly kind: 'delete' } | { readonly kind: 'add' };

type Written = { readonly ok: true; readonly anchor?: string | null } | { readonly ok: false; readonly reason: string | null };

export class SpecEdits {
	/** The element being edited, one at a time. */
	editing = $state<string | null>(null);
	text = $state('');
	desc = $state('');
	tags = $state<string[]>([]);
	tagIn = $state('');
	/** The product's classification while its summary is edited; null for any other element. */
	classification = $state<ProductClassification | null>(null);

	/** The act on its way on each element, by its anchor: a second one replaces it and saves after it. */
	readonly #acts = new OptimisticActs<ElementAct>();
	/** Every save of the page, one after the other: two sections never race. */
	readonly #queue = new SaveQueue();
	#added = $state.raw<AddedElement[]>([]);
	/** The element added here whose first editor is still open: its list keeps it at its foot (criterion 4b3d2b4d). */
	#naming = $state<string | null>(null);
	/**
	 * The texts changed in the page's Edit mode and not saved yet (criterion 41514698), by element: each whole,
	 * as Save will write it. Typing saves nothing; Save writes them all, Discard drops them.
	 */
	staged = $state<Record<string, EditValues>>({});
	/** The element just added in the Edit mode: its name's field takes the focus, its text selected for typing over. */
	focusOn = $state<string | null>(null);

	constructor(
		readonly projectId: string,
		private readonly canWrite: () => boolean
	) {}

	shape(anchor: string): EditShape | null {
		return editShapeOf(anchor);
	}

	open(anchor: string, values: EditValues) {
		if (this.editing === anchor) return this.cancel();
		// What was typed in the Edit mode and not saved yet is what its editor opens on.
		this.#fill(anchor, this.staged[anchor] ?? values);
	}

	/* ── The Edit mode's texts, held until Save (criterion 41514698) ──── */

	/** How many elements hold a change not saved yet. */
	get stagedCount(): number {
		return Object.keys(this.staged).length;
	}

	/** An element's fields as the Edit mode shows them: what was typed, else what the page shows. */
	current(anchor: string, read: EditValues): EditValues {
		return this.staged[anchor] ?? this.shown(anchor, read);
	}

	/** Whether a field of an element was changed and not saved yet: its mark. */
	changed(anchor: string, read: EditValues, field: 'text' | 'desc'): boolean {
		const held = this.staged[anchor];
		return !!held && (held[field] ?? '') !== (this.shown(anchor, read)[field] ?? '');
	}

	/** Whether an element's list of texts (a problem's symptoms) was changed and not saved yet. */
	changedTags(anchor: string, read: EditValues): boolean {
		const held = this.staged[anchor];
		return !!held && !sameTags(held.tags, this.shown(anchor, read).tags);
	}

	/** Hold what was typed in a field; a text typed back to what the page shows holds nothing. */
	stage(anchor: string, read: EditValues, field: 'text' | 'desc', value: string) {
		this.#hold(anchor, read, { [field]: value });
	}

	/** Hold an element's list of texts as typed (a symptom changed, added or removed). */
	stageTags(anchor: string, read: EditValues, tags: readonly string[]) {
		this.#hold(anchor, read, { tags: [...tags] });
	}

	#hold(anchor: string, read: EditValues, patch: Partial<EditValues>) {
		const shown = this.shown(anchor, read);
		const next: EditValues = { ...(this.staged[anchor] ?? shown), ...patch };
		const same = next.text === shown.text && (next.desc ?? '') === (shown.desc ?? '') && sameTags(next.tags, shown.tags);
		const rest = Object.fromEntries(Object.entries(this.staged).filter(([a]) => a !== anchor));
		this.staged = same ? rest : { ...rest, [anchor]: next };
	}

	/** Put every text back as the page shows it; an element added in the mode takes its place in its list. */
	discardStaged() {
		this.staged = {};
		this.#naming = null;
	}

	/**
	 * Save every change held: each reads as saved at once and is written behind the others; one refused comes
	 * back as typed, with a message saying why. Answers whether every one was written.
	 */
	async saveStaged(): Promise<boolean> {
		const held = Object.entries(this.staged);
		if (held.length === 0 || !this.#writable()) return held.length === 0;
		this.staged = {};
		// Saved, an element added in the mode takes its alphabetical place (criterion 4b3d2b4d).
		this.#naming = null;
		const written = await Promise.all(
			held.map(async ([anchor, values]) => ({ anchor, values, written: await this.#send(anchor, { kind: 'edit', values }, { op: 'edit', anchor, ...values }) }))
		);
		const refused = written.filter((w) => !w.written.ok);
		if (refused.length === 0) {
			pushToast({ level: 'success', message: held.length === 1 ? 'Change saved' : `${held.length} changes saved` });
			return true;
		}
		// What was refused comes back as typed, unless it was typed again meanwhile.
		this.staged = { ...Object.fromEntries(refused.map((r) => [r.anchor, r.values])), ...this.staged };
		const reason = refused.map((r) => (r.written.ok ? null : r.written.reason)).find(Boolean) ?? '';
		pushToast({ level: 'error', message: `${refused.length === 1 ? 'A change was' : `${refused.length} changes were`} not saved. ${reason}`.trim() });
		return false;
	}

	#fill(anchor: string, values: EditValues) {
		this.#naming = null;
		this.editing = anchor;
		this.text = values.text;
		this.desc = values.desc ?? '';
		this.tags = [...(values.tags ?? [])];
		this.tagIn = '';
		this.classification = values.classification ? { ...values.classification, formFactors: [...values.classification.formFactors] } : null;
	}

	cancel() {
		this.editing = null;
	}

	/** True while the element just added here is being named, until the Edit mode's changes are saved or discarded (criterion 4b3d2b4d). */
	naming(anchor: string): boolean {
		return this.#naming === anchor;
	}

	/** These elements but the one being edited: nothing of a block is validated while it is (criterion 42cb9176). */
	notEditing(anchors: readonly string[]): string[] {
		return anchors.filter((a) => a !== this.editing);
	}

	addTag() {
		const t = this.tagIn.trim();
		if (t && !this.tags.includes(t)) this.tags = [...this.tags, t];
		this.tagIn = '';
	}

	removeTag(i: number) {
		this.tags = this.tags.filter((_, k) => k !== i);
	}

	/* ── What the page shows: what it read, with the acts on their way laid over it ── */

	#pendingOn(anchor: string): ElementAct | null {
		return this.#acts.of(anchor);
	}

	/** An element's fields as the page shows them: an edit on its way reads as the section will hold it. */
	shown(anchor: string, read: EditValues): EditValues {
		const act = this.#pendingOn(anchor);
		if (act?.kind !== 'edit') return read;
		const fields = editedFields(read, act.values);
		const classification = act.values.classification ?? read.classification;
		return {
			text: fields.text,
			...(read.desc !== undefined || act.values.desc !== undefined ? { desc: fields.desc } : {}),
			...(read.tags !== undefined || act.values.tags !== undefined ? { tags: fields.tags } : {}),
			...(classification ? { classification } : {})
		};
	}

	/** True while an edit of this element is on its way (what the page derives from it reads from the edit). */
	edited(anchor: string): boolean {
		return this.#pendingOn(anchor)?.kind === 'edit';
	}

	/** True once the element was deleted here, until the page reads it gone (or the delete is refused). */
	gone(anchor: string): boolean {
		return this.#pendingOn(anchor)?.kind === 'delete';
	}

	/** The users or core features added here that the page has not read back yet, oldest first. */
	added(as: AddedElement['as'], readIds: readonly string[]): AddedElement[] {
		return this.#added.filter((a) => a.as === as && !readIds.includes(a.id) && !this.gone(a.anchor));
	}

	/* ── Acts ─────────────────────────────────────────────────────────── */

	#writable(): boolean {
		if (this.canWrite()) return true;
		pushToast({ level: 'info', message: 'You can read this specification, not change it: ask a project editor.' });
		return false;
	}

	async #write(body: Record<string, unknown>): Promise<Written> {
		let res: Response;
		try {
			res = await fetch(`/projects/${encodeURIComponent(this.projectId)}/spec/edit`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
				body: JSON.stringify(body)
			});
		} catch {
			return { ok: false, reason: 'Check your connection.' };
		}
		if (!res.ok) return { ok: false, reason: await refusalOf(res, 'The change failed') };
		const answer = (await res.json().catch(() => null)) as { anchor?: unknown } | null;
		await Promise.all([invalidate(projectSyncKey(this.projectId)), invalidate(sectionSyncKey(this.projectId, RETROSPEC_SECTION))]);
		return { ok: true, anchor: typeof answer?.anchor === 'string' ? answer.anchor : null };
	}

	/**
	 * Show an act on an element at once and save it behind the ones before it.
	 * Answers why it was refused; a null reason means it was never sent, an act
	 * before it on the element having failed (that one already said why).
	 */
	async #send(anchor: string, act: ElementAct, body: Record<string, unknown>): Promise<Written> {
		let written: Written = { ok: false, reason: null };
		await this.#acts.run(anchor, act, async () => (written = await this.#queue.run(() => this.#write(body))).ok, () => page.data);
		return written;
	}

	/** Save the open editor: it closes on the new text at once; a refusal reopens it on what was typed. */
	save() {
		const anchor = this.editing;
		const shape = anchor ? this.shape(anchor) : null;
		if (!anchor || !shape || !this.#writable()) return;
		if (shape.tags) this.addTag();
		const values: EditValues = {
			text: this.text,
			...(shape.desc ? { desc: this.desc } : {}),
			...(shape.tags ? { tags: [...this.tags] } : {}),
			...(this.classification ? { classification: { ...this.classification, formFactors: [...this.classification.formFactors] } } : {})
		};
		const body: Record<string, unknown> = { op: 'edit', anchor, ...values };
		this.editing = null;
		// Its editor carried what was typed in the Edit mode: saved with it, nothing of it stays held.
		this.staged = Object.fromEntries(Object.entries(this.staged).filter(([a]) => a !== anchor));
		void this.#send(anchor, { kind: 'edit', values }, body).then((written) => {
			if (written.ok) return;
			const reopen = () => this.#fill(anchor, values);
			// Never sent (an edit before it on this element failed): what was typed last is what the editor shows again.
			if (written.reason === null) return void ((this.editing === null || this.editing === anchor) && reopen());
			if (this.editing === null) reopen();
			pushToast({
				level: 'error',
				message: `Your edit of “${values.text.trim() || shape.text}” was not saved. ${written.reason}`,
				...(this.editing === anchor ? {} : { action: { label: 'Edit again', run: reopen } })
			});
		});
	}

	/** Reject an issue of What Lyriks noticed, kept as it is (criterion e0f69b3c); answers whether it was. */
	async keepFinding(issueId: string): Promise<boolean> {
		if (!this.#writable()) return false;
		const written = await this.#queue.run(() => this.#write({ op: 'keep_finding', issueId }));
		if (!written.ok) pushToast({ level: 'error', message: `The point was not rejected. ${written.reason ?? ''}`.trim() });
		return written.ok;
	}

	/** Take a rejection back: the issue is open again (criterion e0f69b3c); answers whether it is. */
	async reopenFinding(issueId: string): Promise<boolean> {
		if (!this.#writable()) return false;
		const written = await this.#queue.run(() => this.#write({ op: 'reopen_finding', issueId }));
		if (!written.ok) pushToast({ level: 'error', message: `The point was not put back to review. ${written.reason ?? ''}`.trim() });
		return written.ok;
	}

	/** Tick a cell of who can do what: on grants the user the action, off takes it back (criterion eba33558). */
	async tickPermission(roleId: string, capabilityId: string, on: boolean): Promise<boolean> {
		if (!this.#writable()) return false;
		const written = await this.#queue.run(() => this.#write({ op: 'tick_permission', roleId, capabilityId, on }));
		if (!written.ok) pushToast({ level: 'error', message: `The right was not changed. ${written.reason ?? ''}`.trim() });
		return written.ok;
	}

	/** Set a target of Operations on Health (criterion 970aca7c); a refusal names the field at fault. */
	async setOperationsTarget(edit: OperationsTargetEdit): Promise<boolean> {
		if (!this.#writable()) return false;
		const written = await this.#queue.run(() => this.#write({ op: 'set_operations_target', ...edit }));
		if (!written.ok) pushToast({ level: 'error', message: `The targets were not saved. ${written.reason ?? ''}`.trim() });
		return written.ok;
	}

	/**
	 * Add an element at the foot of its list (criterion 51e215ef): its row shows at once, open to edit, under the id
	 * the page minted. `parentId` is the core feature a feature goes into.
	 */
	async add(kind: AddedElement['as'], parentId?: string) {
		if (!this.#writable()) return;
		const id = mintUuid();
		const anchor = `${kind === 'user' ? 'role' : kind}:${id}`;
		const name = kind === 'user' ? NEW_USER_NAME : kind === 'core' ? NEW_CORE_NAME : kind === 'feature' ? NEW_FEATURE_NAME : NEW_NAME[kind];
		const added: AddedElement = { as: kind, id, anchor, name, ...(parentId ? { coreId: parentId } : {}) };
		this.#added = [...this.#added, added];
		// Its name is a field of the Edit mode, selected for typing over (criterion 41514698), held until Save.
		this.focusOn = anchor;
		this.#naming = anchor;
		this.#reveal(anchor);
		const body =
			kind === 'feature' ? { op: 'add_feature', id, coreId: parentId }
			: kind === 'user' || kind === 'core' ? { op: kind === 'user' ? 'add_user' : 'add_core', id }
			: { op: 'add_element', kind, id };
		const written = await this.#send(anchor, { kind: 'add' }, body);
		this.#added = this.#added.filter((a) => a.id !== id);
		if (written.ok) return;
		if (this.focusOn === anchor) this.focusOn = null;
		this.staged = Object.fromEntries(Object.entries(this.staged).filter(([a]) => a !== anchor));
		if (written.reason !== null) pushToast({ level: 'error', message: `The ${name.replace(/^New /, 'new ')} was not added. ${written.reason}` });
	}

	/**
	 * Add an action to a feature (criterion 51e215ef): the behavior engine mints its id, so its row shows once the
	 * server answers, then opens to edit like any other new element.
	 */
	async addAction(featureId: string) {
		if (!this.#writable()) return;
		const pending = `action:${featureId}:new`;
		const written = await this.#send(pending, { kind: 'add' }, { op: 'add_action', featureId });
		if (!written.ok) {
			if (written.reason !== null) pushToast({ level: 'error', message: `The new action was not added. ${written.reason}` });
			return;
		}
		if (!written.anchor) return;
		this.focusOn = written.anchor;
		this.#naming = written.anchor;
		this.#reveal(written.anchor);
	}

	#reveal(anchor: string) {
		void tick().then(() => requestAnimationFrame(() => document.getElementById(anchorDomId(anchor))?.scrollIntoView({ behavior: scrollMotion(), block: 'center' })));
	}

	/** Delete an element once confirmed: it leaves the page at once, and comes back if the delete is refused. */
	async remove(anchor: string, name: string) {
		const ok = await confirmDialog({
			title: `Delete “${name}”?`,
			message: 'It leaves the specification for everyone. Its discussions stay readable.',
			confirmLabel: 'Delete'
		});
		if (!ok || !this.#writable()) return;
		if (this.editing === anchor) this.editing = null;
		const written = await this.#send(anchor, { kind: 'delete' }, { op: 'delete', anchor });
		if (!written.ok && written.reason !== null) pushToast({ level: 'error', message: `“${name}” was not deleted. ${written.reason}` });
	}
}

const KEY = Symbol('spec360-edits');
export const provideEdits = (e: SpecEdits) => setContext(KEY, e);
export const useEdits = () => getContext<SpecEdits>(KEY);
