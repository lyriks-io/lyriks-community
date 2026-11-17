<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import { tick, untrack, type Snippet } from 'svelte';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import { Button, Chip, Icon, MultiSelect, TextInput, Textarea, promptDialog, pushToast, type IconName } from '$ui/design-system';
	import { linesOf, needKeyOf, pointsOf, proseStatements, statementCount, textOfPoints, type BlockField } from '$domain/evolution';
	import type { DossierFieldRow, ProposalRow } from '$lib/server/evolution-view.server';
	import CitedSources from '$ui/documents/CitedSources.svelte';
	import { applyEvolution } from './reading-api';
	import { personName } from './people';
	import { TONE, type Tone } from './verdict-tones';
	import { questionState, stepOfTarget, type QuestionState } from '$domain/evolution';
	import MentionText from './MentionText.svelte';
	import MentionTextarea from './MentionTextarea.svelte';
	import MeasureTable from './MeasureTable.svelte';
	import FieldVersionList from './FieldVersionList.svelte';
	import ListEditor from './ListEditor.svelte';
	import CatchUpOffer from './CatchUpOffer.svelte';
	import QuestionMenu from './QuestionMenu.svelte';
	import FieldThread from './FieldThread.svelte';
	import { toggleCommentsInView } from '$ui/shell/comments-in-view';
	import { useLiveSession } from './live-session.svelte';
	import { conversationsOf } from './thread-conversations';
	import NamedValidators from './NamedValidators.svelte';
	import { withPendingAnswer } from './optimistic-answer';
	import { withPendingVerdict, type PendingVerdict } from './optimistic-verdict';
	import { parseMeasure, personKey } from '$domain/evolution';
	import { initials } from '$ui/team/team-style';

	/**
	 * One question of the idea, for one touched feature: what the spec holds
	 * today, what the assistant proposes, and the person's decision. Accepting
	 * writes the value into the feature; typing writes it directly; either way
	 * the dossier keeps no copy.
	 */
	type FieldView = DossierFieldRow;
	type ProposalView = ProposalRow;

	interface Props {
		projectId: string;
		requestId: string;
		field: FieldView;
		meta: BlockField;
		proposal: ProposalView | null;
		canEdit: boolean;
		/** The roster a proposal can be handed to, and who can be named to validate; empty where one member is alone. */
		members: readonly { id: string; name: string; role?: string; jobs?: readonly string[]; jobIds?: readonly string[] }[];
		/** Who is reading. */
		actorId: string;
		/** The versions this field went through, newest first (ac-evo-hist-field-versions). */
		versions?: readonly FieldVersionView[];
		/** Anyone with access comments, a viewer included (ac-evo-fthread-anyone). */
		canComment?: boolean;
		/** Whether the reader may validate the field: anyone with access but a viewer (ac-evo-hist-field-validation). */
		canValidate?: boolean;
		/** Set on the description a step opens on: it writes through update_step_description. */
		describedStep?: string | null;
		/** Set on a question a step asks after its description: it writes through answer_step (ac-evo-func-prose). */
		stepQuestion?: { readonly step: string; readonly key: string } | null;
		/** An answer of a step of prose that is not its description nor one of its questions, such as a question of the Need. */
		prose?: boolean;
		/** The text may cite elements of the product with @ (ac-evo-func-mention); `mentionLinks` holds the cited ones that still exist. */
		mentions?: boolean;
		mentionLinks?: Readonly<Record<string, { readonly href: string | null }>>;
		/** Whether an answer is owed before the step stands; the field's own criticality when left out. */
		required?: boolean;
		/** How many different people the request asks to validate an answer (ac-evo-req-validations-per-answer). */
		validationsNeeded?: number;
		/**
		 * Set on an answer that is not read as text (the Functional spec's diagram,
		 * ac-evo-func-uml-edit): it is shown and edited by this instead of the text and
		 * its editor, and saves through the card so the new version shows at once.
		 */
		answerBody?: Snippet<[{ value: string; editable: boolean; busy: boolean; save: (value: string) => Promise<boolean>; earlier: string | null }]>;
		/**
		 * Set while the diagram this text is paired with moved past it
		 * (ac-evo-func-uml-sync): in place of the text, the ways to update it from
		 * the diagram, by hand included; a save, even of the text unchanged, is
		 * that update (write_text_from_diagram).
		 */
		behindDiagram?: {
			readonly step: 'functional_spec' | 'technical_spec';
			readonly key: string;
			readonly prompt: string;
			readonly assist: { readonly run: () => void; readonly drawing: boolean; readonly failure?: string | null } | null;
		} | null;
		/** The card's place in its tab, shown in the round mark of its title. */
		number?: number | null;
		/** A title in place of the question's label, for a card that holds more than its answer. */
		title?: string | null;
		/** What the card shows above the answer, such as where the request comes from. */
		lead?: Snippet;
		/**
		 * How a written answer reads, in place of the plain text or list; `edit`
		 * opens the editor, on one point when given its place.
		 */
		readBody?: Snippet<[{ value: string; edit: (at?: number | null) => void; editable: boolean }]>;
		/** The card after this one in its tab: saving can move the editor on to it, the way the design walks a tab. */
		next?: { readonly title: string; readonly edit: () => void } | null;
		/** Set by the page, a new stamp each time, to open this card's editor as the card before it saves. */
		editNow?: number;
	}
	interface FieldVersionView {
		readonly id: string;
		readonly value: string;
		readonly by: string;
		readonly byKind: string;
		readonly source: string;
		readonly at: string;
		readonly validatedBy: readonly string[];
	}
	let {
		projectId,
		requestId,
		field: savedField,
		meta,
		proposal,
		canEdit,
		members,
		actorId,
		versions = [],
		canComment = canEdit,
		canValidate = canEdit,
		describedStep = null,
		stepQuestion = null,
		prose = false,
		mentions = false,
		mentionLinks = {},
		required,
		validationsNeeded = 1,
		answerBody,
		behindDiagram = null,
		number = null,
		title = null,
		lead,
		readBody,
		next = null,
		editNow = 0
	}: Props = $props();
	/** Make it a comment, on an exchange of the reader with their AI (ac-evo-live-ask). */
	const live = useLiveSession();

	/**
	 * The text just saved, shown at once while the server writes it, and
	 * dropped when the save fails (ac-evo-form-edit-optimistic).
	 */
	let pending = $state<string | null>(null);
	/** The act just sent on the answer, shown the same way until the server answers (ac-evo-form-edit-optimistic). */
	let pendingVerdict = $state<PendingVerdict | null>(null);
	const field = $derived(withPendingVerdict(withPendingAnswer(savedField, pending), pendingVerdict, actorId, validationsNeeded));

	const memberOptions = $derived(members.map((m) => ({ code: m.id, label: m.name })));
	const reviewed = $derived((proposal?.reviewerIds.length ?? 0) > 0);
	// Asking someone to look leaves the decision open to anyone with access (ac-evo-llm-11).
	const mayDecide = true;
	const nameOf = (id: string) => personName(id, members);
	// A reading sent before trails existed (a page open across a reload) reads as unvalidated.
	const trail = $derived(field.trail ?? ({ validation: 'unvalidated', versionCount: 0 } as FieldView['trail']));
	let versionsOpen = $state(false);
	/**
	 * The earlier version of a drawn answer the reader looks at in place of the
	 * current one: their own view, kept nowhere (ac-evo-hist-field-versions).
	 */
	let shownVersion = $state<string | null>(null);
	const earlierShown = $derived(answerBody && shownVersion ? (versions.slice(1).find((v) => v.id === shownVersion) ?? null) : null);
	const earlierNumber = $derived(earlierShown ? versions.length - versions.indexOf(earlierShown) : 0);
	/** Who stands behind the current version, and whether the reader is among them (ac-evo-form-validators). */
	const validators = $derived(trail.validation === 'refused' ? [] : (trail.validatedBy ?? []));
	const validatedByMe = $derived(validators.includes(actorId));
	/** A diagram validated reads only until a validation of it is taken back (ac-evo-func-uml-edit). */
	const drawingHeld = $derived(!!answerBody && trail.validation === 'validated');
	/**
	 * An answer of the Need or the Solution names who validates it
	 * (ac-evo-req-named-validators); once someone is named, the count reads the
	 * people named who validated, of the people named (ac-evo-form-validators).
	 */
	const namedStep = $derived(field.leafId ? null : stepOfTarget(field.path));
	const expected = $derived(trail.expected ?? []);
	const needed = $derived(expected.length > 0 ? expected.length : validationsNeeded);
	const counted = $derived(expected.length > 0 ? (trail.counted ?? 0) : validators.length);
	const VALIDATION_LOOK = $derived(
		trail.validation === 'validated'
			? { tone: TONE.ok, text: `Validated by ${(trail.validatedBy ?? []).map(nameOf).join(', ')}` }
			: trail.validation === 'refused'
				? { tone: TONE.blocks, text: `Refused by ${trail.refusedBy ? nameOf(trail.refusedBy) : 'a member'}${trail.refusalReason ? `: ${trail.refusalReason}` : ''}` }
			: trail.validation === 'outdated'
				? { tone: TONE.decide, text: `Changed since ${trail.outdatedBy ? nameOf(trail.outdatedBy) : 'someone'} validated it` }
				: trail.validation === 'changed_outside'
					? { tone: TONE.decide, text: 'Changed outside the dossier since its last version here' }
					: { tone: TONE.before, text: 'Not validated' }
	);

	let editing = $state(false);
	let draft = $state('');
	/**
	 * The points of an answer edited as the list it reads as, or null while it is
	 * edited as one text (ac-evo-form-list-edit).
	 */
	let points = $state<string[] | null>(null);
	/** The point a click opened alone, by its place among the points; null when every point opened (ac-evo-form-list-edit). */
	let only = $state<number | null>(null);
	/**
	 * Whether the comments are shown: folded until the reader opens them. The
	 * count on the title line says the topics not resolved, in amber while one
	 * still waits on someone.
	 */
	let threadChoice = $state<boolean | null>(null);
	const topics = $derived(conversationsOf(field.thread?.messages ?? []));
	const messageCount = $derived(topics.filter((t) => t.opener.ruling?.state !== 'resolved').length);
	const waitingTopics = $derived(topics.some((t) => !t.opener.ruling));
	const threadOpen = $derived(threadChoice ?? false);
	let reasoningOpen = $state(false);
	let keptOpen = $state(false);
	let busy = $state(false);
	/** The person's reason for keeping a flagged word, recorded beside the value. */
	let sense = $state('');

	/**
	 * A field of statements is read as statements: one bullet each, with air.
	 * And a proposal on one is read as what it CHANGES, because resending the
	 * whole list to amend two lines is what turns a decision into a wall.
	 */
	const isList = $derived(meta.kind === 'list');
	/** Whether this answer may be written as a list at all: a list field, or a text of a step of prose. */
	const listable = $derived(isList || prose || describedStep !== null || stepQuestion !== null);
	const heldLines = $derived(isList ? linesOf(field.value) : []);
	// A text of a step of prose reads as its statements as soon as it says more than one thing (ac-evo-form-prose-as-list).
	const statements = $derived(!isList && (prose || describedStep !== null || stepQuestion !== null) ? proseStatements(field.value) : []);
	// The delta is computed server-side, against the value in full: the row here
	// carries an excerpt, and a delta against an excerpt invents additions.
	const delta = $derived(proposal?.delta ?? null);

	const leafId = $derived(field.leafId ?? '');
	const key = $derived({ requestId, fieldPath: field.path, leafId: field.leafId ?? undefined });

	async function run(op: Record<string, unknown>) {
		busy = true;
		try {
			return await applyEvolution(projectId, [{ ...key, ...op }]);
		} finally {
			busy = false;
		}
	}

	/**
	 * An act on the answer, read on the card at once (ac-evo-form-edit-optimistic):
	 * the server's answer replaces it once the page has read it again, and a
	 * refusal brings the card back as it stood, the toast saying why.
	 */
	async function act(verdict: PendingVerdict, op: Record<string, unknown>): Promise<boolean> {
		pendingVerdict = verdict;
		try {
			return !!(await run(op));
		} finally {
			pendingVerdict = null;
		}
	}

	/** What the card is called in what is said about it. */
	const cardName = $derived(title ?? meta.label);
	/**
	 * A validation shows on the card itself (its stamp, its button), so it
	 * raises no message; only an answer now validated by everyone it waits on
	 * says so, which the card alone does not tell (criterion 8b431894).
	 */
	async function validate() {
		const complete = counted + 1 >= needed && expected.every((id) => personKey(id) === personKey(actorId) || validators.some((v) => personKey(v) === personKey(id)));
		if ((await act({ act: 'validate' }, { op: 'validate_field' })) && complete)
			pushToast({ level: 'success', message: 'Section fully validated: all approvers signed off' });
	}
	async function withdraw() {
		await act({ act: 'withdraw' }, { op: 'withdraw_field_verdict' });
	}
	/** An earlier version written again as a new one. */
	async function restore(value: string) {
		if (await saveFromBody(value)) {
			versionsOpen = false;
			pushToast({ level: 'success', message: 'Version restored' });
		}
	}

	// The page asks this card to open as the one before it saves (Save, then edit the next one).
	let root = $state<HTMLElement>();
	$effect(() => {
		if (!editNow || untrack(() => editing)) return;
		untrack(() => startEditing());
		void tick().then(() => root?.scrollIntoView({ behavior: scrollMotion(), block: 'center' }));
	});

	/** Opens the answer to edit: from a click on one point, that point alone; otherwise all of it. */
	function startEditing(at: number | null = null) {
		draft = field.value;
		// What reads as a list is edited as one: a list field always, a text as soon as it says more than one thing.
		points = isList ? linesOf(field.value) : listable && statementCount(statements) > 1 ? pointsOf(field.value) : null;
		only = points ? at : null;
		editing = true;
	}
	function stopEditing() {
		editing = false;
		points = null;
		only = null;
	}
	/** An answer that says one thing may become a list; a list is never turned back into one text (ac-evo-form-list-edit). */
	function editAsList() {
		points = isList ? linesOf(draft) : pointsOf(draft);
		only = null;
	}
	/** Where each paragraph's statements start among the points, so a click on one opens its point. */
	const statementOffsets = $derived(statements.map((_, p) => statementCount(statements.slice(0, p))));

	/** Write the answer through the operation its kind of question takes. */
	function save(value: string): Promise<boolean> {
		// Written while the diagram moved past it, the text is its update from the diagram (ac-evo-func-uml-sync).
		if (behindDiagram)
			return applyEvolution(projectId, [{ requestId, op: 'write_text_from_diagram', step: behindDiagram.step, question: behindDiagram.key, answer: value }]);
		// A question of the need belongs to the request, not to a section.
		const needKey = needKeyOf(field.path);
		if (describedStep) return applyEvolution(projectId, [{ requestId, op: 'update_step_description', step: describedStep, description: value }]);
		if (stepQuestion) return applyEvolution(projectId, [{ requestId, op: 'answer_step', step: stepQuestion.step, question: stepQuestion.key, answer: value }]);
		if (needKey) return applyEvolution(projectId, [{ requestId, op: 'update_need', [needKey]: value }]);
		// Held on the feature's amendment until the change is official (ac-evo-req-landing).
		return applyEvolution(projectId, [{ requestId, op: 'answer_field', fieldPath: field.path, leafId, value }]);
	}

	/**
	 * Shown at once, before the server answers (ac-evo-form-edit-optimistic).
	 * A failed save brings the saved answer back, the toast says why, and the
	 * editor opens again on what was typed so nothing is lost.
	 */
	async function commit(thenNext = false) {
		if (points) draft = textOfPoints(points);
		stopEditing();
		// Unchanged, a text behind its diagram is still saved: the person says it still holds.
		if (draft === field.value && !behindDiagram) {
			if (thenNext) next?.edit();
			return;
		}
		const typed = draft;
		pending = typed;
		busy = true;
		let saved = false;
		try {
			saved = await save(typed);
		} finally {
			busy = false;
			pending = null;
			if (!saved) {
				draft = typed;
				editing = true;
			}
		}
		if (!saved) return;
		pushToast({ level: 'success', message: thenNext && next ? `Saved · now editing “${next.title}”` : 'Changes saved' });
		if (thenNext) next?.edit();
	}

	/** A save made from the answer's own body, shown at once like a typed one (ac-evo-form-edit-optimistic). */
	async function saveFromBody(value: string): Promise<boolean> {
		if (value === field.value) return true;
		pending = value;
		busy = true;
		try {
			return await save(value);
		} finally {
			busy = false;
			pending = null;
		}
	}

	async function reword() {
		if (!proposal) return;
		const value = await promptDialog({
			title: `Reword the proposed ${meta.label.toLowerCase()}`,
			initial: proposal.value,
			confirmLabel: 'Reword'
		});
		if (value === null) return;
		await run({ op: 'decide_proposal', proposalId: proposal.id, decision: 'reword', value });
	}

	/** Who skipped this question on purpose and why, when it is (ac-evo-form-question-skip). */
	const skipped = $derived(('skipped' in field ? field.skipped : undefined) ?? null);
	/** Postponing is offered until the answer stands validated, and never on a question skipped on purpose. */
	const canPostpone = $derived(canEdit && trail.validation !== 'validated' && !skipped);

	/**
	 * Where the question stands, in the colour law: what a person still owes in
	 * amber, an answer waiting for its validation on a blue edge, a refusal in
	 * red, a validation in green, an optional question and a skip in grey, so
	 * the holes are what the eye finds (ac-evo-form-question-state).
	 */
	const STATE_LOOK: Record<QuestionState, { tone: Tone | null; word: string; icon?: IconName }> = {
		missing: { tone: 'decide', word: 'Missing' },
		postponed: { tone: 'decide', word: 'Postponed' },
		to_sign: { tone: 'decide', word: 'To sign' },
		optional: { tone: 'before', word: 'Optional', icon: 'circle' },
		refused: { tone: 'blocks', word: 'Refused' },
		validated: { tone: 'ok', word: 'Validated' },
		skipped: { tone: 'before', word: 'Skipped', icon: 'skip-forward' },
		to_validate: { tone: null, word: '' }
	};
	const look = $derived.by(() => {
		const state = questionState({
				filled: field.filled,
				required: required ?? !!meta.critical,
				openQuestion: !!field.openQuestion,
				skipped: !!skipped,
				// A proposal shown on the card is one still waiting for a decision.
				proposalWaiting: !!proposal,
				validation: trail.validation
			});
		// An answer waiting for its validation takes the blue edge, an optional question the grey one (ac-evo-form-question-state).
		return { ...STATE_LOOK[state], state };
	});

	/** Whether the reader may validate or refuse the version the answer holds now; nothing is decided on an earlier version. */
	const decidable = $derived(!earlierShown && canValidate && field.filled && trail.validation !== 'validated');
	/** The people named on the answer may be named again until it stands validated (ac-evo-form-name-validators). */
	const mayName = $derived(!!namedStep && canValidate && canEdit && (members.some((m) => m.role !== 'viewer') || expected.length > 0 || (trail.gone ?? []).length > 0));
	let naming = $state(false);

	/**
	 * The '⋯' menu holds the acts the title line leaves out: refusing, coming
	 * back to it later, skipping on purpose, naming who validates and taking a
	 * refusal back (ac-evo-form-question-acts, ac-evo-form-question-skip).
	 */
	const menuItems = $derived.by(() => {
		const items: { label: string; icon: IconName; onSelect: () => void }[] = [];
		if (decidable && trail.validation !== 'refused') items.push({ label: 'Refuse', icon: 'x', onSelect: () => void refuseAnswer() });
		if (canPostpone && !earlierShown)
			items.push({
				label: field.openQuestion ? 'Postponed: answer it now' : 'Come back to it later',
				icon: 'timer',
				onSelect: () => void act({ act: field.openQuestion ? 'resume' : 'postpone' }, { op: field.openQuestion ? 'answer_open_question' : 'mark_open_question' })
			});
		if (canEdit && !field.filled && !skipped) items.push({ label: 'Skip it on purpose', icon: 'skip-forward', onSelect: () => void skipQuestion() });
		if (mayName) items.push({ label: expected.length > 0 ? 'Change who validates' : 'Name who validates', icon: 'users', onSelect: () => (naming = true) });
		if (canValidate && trail.validation === 'refused' && trail.refusedBy === actorId)
			items.push({ label: 'Take back my refusal', icon: 'rotate', onSelect: () => void act({ act: 'withdraw' }, { op: 'withdraw_field_verdict' }) });
		return items;
	});

	/**
	 * The validation as one pill on the title line, like the rest of the page:
	 * Validate while the reader may give it, then the word that says it is given,
	 * which takes the reader's own validation back on a click (ac-evo-hist-verdict-withdraw).
	 */
	const pill = $derived.by((): { label: string; look: string; title: string; run: (() => void) | null } | null => {
		if (earlierShown || !field.filled) return null;
		if (canValidate && validatedByMe)
			return {
				label: 'You validated',
				look: 'text-success-700 hover:bg-success-100',
				title: 'You validated this answer: click to take your validation back',
				run: () => void withdraw()
			};
		if (trail.validation === 'validated') return { label: 'Validated', look: 'text-success-700', title: VALIDATION_LOOK.text, run: null };
		if (decidable) return { label: 'Validate', look: 'bg-brand-600 text-white hover:bg-brand-700', title: 'Validate this answer as it stands', run: () => void validate() };
		return null;
	});
	/**
	 * One round mark per person who stands behind the answer: green once they
	 * validated it, dashed while a person named has not yet (ac-evo-form-validators).
	 */
	const stamps = $derived.by(() => {
		const has = (list: readonly string[], id: string) => list.some((x) => personKey(x) === personKey(id));
		const named = expected.map((id) => ({ id, ok: has(validators, id) }));
		const others = validators.filter((id) => !has(expected, id)).map((id) => ({ id, ok: true }));
		return [...named, ...others].map((s) => ({ ...s, name: nameOf(s.id), title: s.ok ? `Validated by ${nameOf(s.id)}` : `Waiting on ${nameOf(s.id)}` }));
	});
	const awaitingMe = $derived(field.filled && expected.some((id) => personKey(id) === personKey(actorId)) && !validators.some((id) => personKey(id) === personKey(actorId)));

	const threadLabel = $derived(threadOpen ? 'Hide the comments' : messageCount === 0 ? 'Comments' : `Comments · ${messageCount} ${messageCount === 1 ? 'topic' : 'topics'}`);

	/** Leave the question unanswered on purpose, saying why (ac-evo-form-question-skip). */
	async function skipQuestion() {
		const reason = await promptDialog({
			title: `Skip "${meta.label}" on purpose`,
			placeholder: 'Why it is left unanswered',
			confirmLabel: 'Skip it'
		});
		if (reason === null || reason.trim() === '') return;
		await run({ op: 'skip_question', reason });
	}

	/** Refuse the answer the field holds now, saying why (ac-evo-form-question-acts). */
	async function refuseAnswer() {
		const reason = await promptDialog({
			title: `Refuse this ${meta.label.toLowerCase()}`,
			placeholder: 'Why it is not right, so it can be rewritten',
			confirmLabel: 'Refuse'
		});
		if (reason === null || reason.trim() === '') return;
		await act({ act: 'refuse', reason }, { op: 'refuse_field', reason });
	}

	async function refuse() {
		if (!proposal) return;
		const comment = await promptDialog({
			title: `Refuse the proposed ${meta.label.toLowerCase()}`,
			placeholder: 'Why it does not fit (optional)',
			confirmLabel: 'Refuse'
		});
		if (comment === null) return;
		await run({ op: 'decide_proposal', proposalId: proposal.id, decision: 'refuse', comment });
	}

</script>

{#snippet pointRead(text: string)}
	{#if mentions}<MentionText {text} links={mentionLinks} />{:else}{text}{/if}
{/snippet}

<!-- An answer read as its points (ac-evo-form-prose-as-list); clickable, each point opens alone to edit (ac-evo-form-list-edit). -->
{#snippet listRead(clickable: boolean)}
	{#snippet point(text: string, at: number)}
		{#if clickable}
			<button type="button" class="min-w-0 text-left hover:text-brand-700" title="Edit this point" onclick={() => startEditing(at)}>{@render pointRead(text)}</button>
		{:else}
			<span>{@render pointRead(text)}</span>
		{/if}
	{/snippet}
	{#if isList}
		<ul class="space-y-1 text-sm leading-relaxed text-ink-900">
			{#each heldLines as line, index (index)}
				<li class="flex gap-2">
					<span class="mt-1.75 size-1 shrink-0 bg-ink-300"></span>
					{@render point(line, index)}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="space-y-3 text-sm leading-relaxed text-ink-900 {canEdit && !clickable ? 'group-hover:text-brand-700' : ''}">
			{#each statements as paragraph, p (p)}
				<ul class="space-y-1.5">
					{#each paragraph as statement, i (i)}
						<li class="flex gap-2">
							<span class="mt-2 size-1 shrink-0 bg-ink-300"></span>
							{@render point(statement, statementOffsets[p] + i)}
						</li>
					{/each}
				</ul>
			{/each}
		</div>
	{/if}
{/snippet}

<!--
	One question, read at a glance: its name, then its answer or the question
	itself as the empty line to fill. Why it matters and an example sit on hover;
	the thread and "I cannot answer yet" sit behind two icons.
-->
<article
	bind:this={root}
	class="scroll-mt-24 rounded-card border bg-surface p-5 shadow-sm transition-[border-color,box-shadow] duration-300 sm:p-6 {trail.validation === 'validated' ? 'border-success-200' : 'border-line'} {editing ? 'ring-2 ring-ink-900' : ''}"
	aria-label={meta.label}
>
	<header class="flex flex-wrap items-center justify-between gap-3">
		<span class="flex min-w-0 flex-wrap items-center gap-3">
			{#if number !== null}
				<!-- Its place in the tab, ticked green once the answer stands validated. -->
				<span
					class="grid size-7 shrink-0 place-items-center text-[0.8125rem] font-bold {trail.validation === 'validated' ? 'bg-success-600 text-white' : 'bg-ink-200 text-ink-700'}"
					aria-hidden="true"
				>
					{#if trail.validation === 'validated'}<Icon name="check" size={13} />{:else}{number}{/if}
				</span>
			{/if}
			<h3 class="text-base font-semibold text-ink-900 sm:text-lg" title={meta.whyItMatters}>{title ?? meta.label}</h3>
			<!-- Where it stands when it asks for something, its tone, its icon and its word (ac-evo-form-question-state). -->
			{#if look.tone && look.state !== 'validated'}
				<span class="inline-flex items-center gap-1 rounded-pill border px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide {TONE[look.tone].badge}">
					<Icon name={look.icon ?? TONE[look.tone].icon} size={10} />
					{look.word}
				</span>
			{/if}
		</span>
		<span class="flex flex-wrap items-center gap-1.5">
			{#if awaitingMe}
				<!-- The reader is named and has not validated this version yet (ac-evo-req-waiting-on-you). -->
				<span class=" bg-brand-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-700">Waiting on you</span>
			{/if}
			{#if pill || stamps.length > 0}
				<span class="flex items-center gap-2 p-1 transition-colors {trail.validation === 'validated' ? 'bg-success-50' : 'bg-surface-sunken'}">
					{#if pill}
						<button
							type="button"
							class="flex h-7 items-center gap-1 whitespace-nowrap px-3 text-xs font-bold disabled:cursor-default {pill.look}"
							title={pill.title}
							disabled={busy || !pill.run}
							onclick={() => pill?.run?.()}
						>
							{#if pill.label !== 'Validate'}<Icon name="check" size={12} />{/if}{pill.label}
						</button>
					{/if}
					{#if stamps.length > 0}
						<span class="flex gap-0.5">
							{#each stamps as stamp (stamp.id)}
								{@const me = personKey(stamp.id) === personKey(actorId)}
								{@const look = `grid size-7 place-items-center border-2 text-[0.625rem] font-bold ${stamp.ok ? 'border-success-600 bg-success-600 text-white' : 'border-dashed border-ink-300 bg-surface text-ink-500'}`}
								<!-- The avatars only say who validated: only Validate validates (ac-evo-form-validators). -->
								<span class={look} title={stamp.title} role="img" aria-label={stamp.title}>{initials(stamp.name)}</span>
							{/each}
						</span>
					{/if}
					{#if needed > 1 && field.filled && trail.validation !== 'validated' && trail.validation !== 'refused'}
						<!-- How many of how many when the request asks for several (ac-evo-form-validators). -->
						<span
							class="pr-1.5 text-[0.6875rem] font-semibold {TONE.todo.text}"
							title={expected.length > 0 ? `${counted} of the ${needed} people named validated it` : `${counted} of the ${needed} validations this request asks for`}>{counted} of {needed}</span
						>
					{/if}
				</span>
			{/if}
			{#if canEdit && field.filled && !answerBody && !behindDiagram}
				<!-- Saving writes a new version (ac-evo-form-edit-anytime). -->
				<button
					type="button"
					class="grid size-9 place-items-center rounded-field {editing ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-surface-sunken hover:text-brand-700'}"
					title={editing ? 'Close the editor' : 'Edit this answer: saving makes a new version'}
					aria-label={editing ? 'Close the editor' : 'Edit this answer'}
					aria-pressed={editing}
					disabled={busy}
					onclick={() => (editing ? stopEditing() : startEditing())}
				>
					<Icon name="pencil" size={16} />
				</button>
			{/if}
			{#if canComment}
				<!-- The thread with its count, amber once someone wrote (ac-evo-form-question-acts). -->
				<button
					type="button"
					class="flex h-9 items-center gap-1 rounded-field px-2 text-[0.8125rem] hover:bg-surface-sunken {waitingTopics ? 'font-semibold text-warning-700' : threadOpen ? 'text-ink-800' : 'text-ink-500 hover:text-ink-800'}"
					title={threadLabel}
					aria-label={threadLabel}
					aria-expanded={threadOpen}
					onclick={(e) => void toggleCommentsInView(() => (threadChoice = !threadOpen), e.currentTarget)}
				>
					<Icon name="message-circle" size={16} />
					{#if messageCount > 0}{messageCount}{/if}
				</button>
			{/if}
			{#if trail.versionCount > 0}
				<!-- Every version it went through, folded back by the same button (ac-evo-hist-field-versions). -->
				<button
					type="button"
					class="flex h-9 items-center gap-1 rounded-field px-2 text-[0.8125rem] hover:bg-surface-sunken {versionsOpen ? 'text-ink-800' : 'text-ink-500 hover:text-ink-800'}"
					title={versionsOpen ? 'Hide the versions' : `${trail.versionCount} ${trail.versionCount === 1 ? 'version' : 'versions'}`}
					aria-label={versionsOpen ? 'Hide the versions' : `${trail.versionCount} ${trail.versionCount === 1 ? 'version' : 'versions'}`}
					aria-expanded={versionsOpen}
					onclick={() => (versionsOpen = !versionsOpen)}
				>
					<Icon name="history" size={16} />
					<span class="text-[0.6875rem]">{trail.versionCount}</span>
				</button>
			{/if}
			{#if menuItems.length > 0}
				<QuestionMenu label="{meta.label}: more" items={menuItems} />
			{/if}
		</span>
	</header>

	{#if naming && namedStep}
		<!-- Who must validate this answer, the members the step calls for offered first (ac-evo-form-name-validators). -->
		<div class="mt-3">
			<NamedValidators
				bare
				bind:picking={naming}
				step={namedStep}
				{expected}
				gone={trail.gone ?? []}
				given={validators}
				{members}
				{actorId}
				canName={mayName}
				{busy}
				onname={(people) => run({ op: 'name_validators', people })}
			/>
		</div>
	{/if}

	{#if lead}<div class="mt-4">{@render lead()}</div>{/if}

	<!-- The answer, or the question as the line to fill -->
	<div class="mt-4">
		{#if behindDiagram && !editing}
			<!-- The text is behind its diagram: it is not shown, its card offers the ways to update it, by hand included (ac-evo-func-uml-sync). -->
			<CatchUpOffer
				title="Update the {behindDiagram.key === 'description' ? 'description' : meta.label.toLowerCase()} from the diagram"
				editable={canEdit}
				{busy}
				assist={behindDiagram.assist}
				prompt={behindDiagram.prompt}
				step={behindDiagram.step}
				byHand={{ label: 'Write it myself', run: () => startEditing() }}
			/>
		{:else if answerBody && !skipped}
			{#if earlierShown}
				<!-- An earlier drawing in place of the current one, read only, for this reader alone (ac-evo-hist-field-versions). -->
				<p class="mb-2 flex flex-wrap items-center gap-1.5 rounded-field border border-l-4 px-2.5 py-1.5 text-xs {TONE.before.box}">
					<Icon name={TONE.before.icon} size={12} class="shrink-0 {TONE.before.text}" />
					<span><span class="font-semibold text-ink-700">Earlier version</span> {earlierNumber} of {versions.length}, shown to you alone: not the diagram as it stands, which is version {versions.length}.</span>
					<button type="button" class="ml-auto font-medium text-brand-700 hover:underline" onclick={() => (shownVersion = null)}>Back to the current one</button>
				</p>
			{/if}
			<!-- One drawing for every version, so moving between them keeps the view the reader is in. -->
			{@render answerBody({ value: field.value, editable: canEdit && !drawingHeld, busy, save: saveFromBody, earlier: earlierShown?.value ?? null })}
			{#if drawingHeld && canEdit && !earlierShown}
				<p class="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-600">
					<Icon name="lock" size={12} class="shrink-0 text-ink-400" />
					{#if validatedByMe && canValidate}
						<!-- The act itself is the foot's own Take back (ac-evo-hist-verdict-withdraw). -->
						<span>Validated, so it reads only: take your validation back on its pill to change it.</span>
					{:else}
						<span>Validated by {validators.map(nameOf).join(', ')}, so it reads only: it edits again once one of them takes their validation back.</span>
					{/if}
				</p>
			{/if}
		{:else if editing}
			{#if points}
				<!-- What reads as a list is edited as one, a field per point (ac-evo-form-list-edit). -->
				<ListEditor {projectId} {points} {only} cite={mentions} placeholder={meta.example} read={pointRead} onchange={(next) => (points = next)} />
			{:else if mentions}
				<MentionTextarea {projectId} value={draft} rows={3} placeholder={meta.example} oninput={(v) => (draft = v)} />
				<p class="mt-1 text-[0.6875rem] text-ink-400">Type @ to cite a feature, a screen, a rule or a glossary term.</p>
			{:else}
				<Textarea value={draft} rows={meta.kind === 'list' ? 4 : 2} placeholder={meta.example} oninput={(v) => (draft = v)} />
			{/if}
			<!-- Cancel and Save on the right, Save last (ac-evo-form-edit-anytime); a list is never offered as one text (ac-evo-form-list-edit). -->
			<div class="mt-1.5 flex items-center gap-2">
				{#if listable && !points}
					<button type="button" class="text-[0.6875rem] font-medium text-ink-500 hover:text-brand-700" onclick={editAsList}>Edit as a list</button>
				{/if}
				<span class="ml-auto flex flex-wrap items-center justify-end gap-2">
					<Button size="sm" variant="ghost" onclick={stopEditing}>Cancel</Button>
					<Button size="sm" variant={next ? 'outline' : 'primary'} onclick={() => commit()} disabled={busy}>Save</Button>
					{#if next}
						<!-- Saves, then opens the next card of the tab, the way the design walks it. -->
						<button
							type="button"
							class="min-h-8 rounded-field bg-ink-900 px-3 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"
							disabled={busy}
							onclick={() => commit(true)}>Save, then edit: {next.title} →</button
						>
					{/if}
				</span>
			</div>
		{:else if field.filled}
			{@const measures = !isList && field.path.endsWith('.measures') ? field.value.split('\n').map(parseMeasure) : []}
			{@const table = measures.length > 0 && measures.every((m) => m !== null)}
			{@const listed = !table && (isList ? heldLines.length > 0 : statementCount(statements) > 1)}
			{#if readBody}
				{@render readBody({ value: field.value, edit: (at) => startEditing(at ?? null), editable: canEdit })}
			{:else if listed && canEdit}
				<!-- A list opens point by point: a click on a point opens that point alone (ac-evo-form-list-edit). -->
				{@render listRead(true)}
			{:else}
				<button type="button" class="group block w-full text-left" disabled={!canEdit} onclick={() => startEditing()} title={canEdit ? 'Edit' : undefined}>
					{#if table}
						<MeasureTable measures={measures.filter((m) => m !== null)} />
					{:else if listed}
						{@render listRead(false)}
					{:else}
						<p class="whitespace-pre-line text-sm leading-relaxed text-ink-900 {canEdit ? 'group-hover:text-brand-700' : ''}">{#if mentions}<MentionText text={field.value} links={mentionLinks} />{:else}{field.value}{/if}</p>
					{/if}
				</button>
			{/if}
		{:else if skipped}
			<!-- Skipped on purpose: settled, in the grey of what is already there (ac-evo-form-question-skip). -->
			<div class="flex flex-wrap items-center gap-2 rounded-field border border-line bg-surface-sunken/60 px-3 py-2 text-sm text-ink-500">
				<Icon name="skip-forward" size={13} class="shrink-0 text-ink-400" />
				<span class="min-w-0 flex-1">Skipped on purpose by {nameOf(skipped.by)}: {skipped.reason}</span>
				{#if canEdit}
					<button type="button" class="text-xs font-medium text-brand-700 hover:underline" disabled={busy} onclick={() => run({ op: 'unskip_question' })}>Answer it after all</button>
				{/if}
			</div>
		{:else if !proposal}
			{#if canEdit}
				<button
					type="button"
					class="w-full rounded-field border border-dashed border-line px-3 py-2 text-left text-sm text-ink-400 hover:border-brand-400 hover:text-ink-700"
					title={meta.example}
					onclick={() => startEditing()}
				>
					{meta.question}
				</button>
			{:else}
				<!-- Nobody can write it here: an empty answer reads as such (ac-evo-form-answers-read). -->
				<p class="text-sm italic text-ink-400" title={meta.question}>Not answered</p>
			{/if}
		{/if}
	</div>

	<!-- What was asked of this field in particular: why it reads as incomplete (ac-evo-coach-custom-4) -->
	{#if trail.asked && trail.asked.length > 0}
		<ul class="mt-2 space-y-1">
			{#each trail.asked as question (question.id)}
				<li class="flex items-start gap-1.5 rounded-field border border-l-4 px-2.5 py-1.5 text-xs {TONE.decide.box}">
					<Icon name={TONE.decide.icon} size={12} class="mt-0.5 shrink-0 {TONE.decide.text}" />
					<span><span class="font-semibold {TONE.decide.text}">Incomplete:</span> {question.question} <span class="text-ink-500">({question.why})</span></span>
				</li>
			{/each}
		</ul>
	{/if}
	<!-- What the glossary says of the text as written: a warning, never a wall (ac-evo-form-glossary) -->
	{#if trail.glossary && trail.glossary.length > 0}
		<p class="mt-2 flex items-start gap-1 text-xs {TONE.decide.text}">
			<Icon name="info" size={12} class="mt-0.5 shrink-0" />
			<span>{#each trail.glossary as flag, index (flag.word)}{index > 0 ? ' ' : ''}"{flag.word}" is a word the glossary keeps for another sense{flag.prefer ? `: it says "${flag.prefer}".` : '.'}{/each} The text is kept as written.</span>
		</p>
	{/if}

	<!-- What the assistant proposes -->
	{#if proposal}
		<div class="mt-3 rounded-field border border-brand-100 bg-brand-50/60 p-3">
			<p class="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-600">
				<Icon name="target" size={12} />
				Proposed
				{#if proposal.decision === 'reworded'}<span class="font-normal normal-case text-ink-400">(reworded)</span>{/if}
			</p>
			{#if delta}
				{#if delta.identical}
					<p class="mt-1.5 text-sm italic text-ink-400">This proposal changes nothing.</p>
				{:else}
					<ul class="mt-2 space-y-2 text-sm leading-relaxed">
						{#each delta.added as line, index (index)}
							<li class="flex gap-2 text-ink-900">
								<span class="mt-0.5 shrink-0 font-semibold text-success-600">+</span>
								<span><GlossaryText text={line} /></span>
							</li>
						{/each}
						{#each delta.removed as line, index (index)}
							<li class="flex gap-2 text-ink-400">
								<span class="mt-0.5 shrink-0 font-semibold text-danger-500">&minus;</span>
								<span class="line-through"><GlossaryText text={line} /></span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if delta.keptCount > 0}
					<button
						type="button"
						class="mt-2 flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700"
						onclick={() => (keptOpen = !keptOpen)}
					>
						<Icon name={keptOpen ? 'chevron-up' : 'chevron-down'} size={12} />
						{delta.keptCount} unchanged
					</button>
					{#if keptOpen}
						<ul class="mt-1.5 space-y-1.5 text-xs leading-relaxed text-ink-400">
							{#each heldLines as line, index (index)}
								<li class="flex gap-2">
									<span class="mt-1.5 size-1 shrink-0 bg-ink-300"></span>
									<span><GlossaryText text={line} /></span>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			{:else if isList}
				<ul class="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-900">
					{#each linesOf(proposal.value) as line, index (index)}
						<li class="flex gap-2">
							<span class="mt-1.75 size-1 shrink-0 bg-ink-300"></span>
							<span><GlossaryText text={line} /></span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-900"><GlossaryText text={proposal.value} /></p>
			{/if}
			<button type="button" class="mt-1.5 flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700" onclick={() => (reasoningOpen = !reasoningOpen)}>
				<Icon name={reasoningOpen ? 'chevron-up' : 'chevron-down'} size={12} />
				Why
			</button>
			{#if reasoningOpen}
				<p class="mt-1 text-xs text-ink-700"><GlossaryText text={proposal.reasoning} /></p>
				<div class="mt-1">
					<CitedSources ids={proposal.citedSourceIds} />
				</div>
			{/if}
			{#if proposal.bannedSynonymDetected}
				<!--
					A warning, never a wall: the check matches a word, not its sense, and
					only the person knows which sense they meant.
				-->
				<div class="mt-2 rounded-card border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700">
					<p class="flex items-start gap-1">
						<Icon name="circle-alert" size={12} class="mt-0.5 shrink-0" />
						<span>
							{#each proposal.flaggedWords as flag, index (flag.word)}{index > 0 ? ' ' : ''}"{flag.word}" is a word the glossary keeps for another sense{flag.prefer ? `: here it says "${flag.prefer}".` : '.'}{/each}
							{#if proposal.flaggedWords.length === 0}This value uses a word the glossary avoids.{/if}
							Reword it, or accept it as it stands if you meant another sense.
						</span>
					</p>
					{#if canEdit && mayDecide}
						<TextInput
							value={sense}
							oninput={(v) => (sense = v)}
							placeholder="Optional: the sense you meant, kept beside the value"
							class="mt-1.5"
						/>
					{/if}
				</div>
			{/if}
			{#if !proposal.acceptable.ok}
				<p class="mt-2 flex items-center gap-1 text-xs text-warning-700">
					<Icon name="circle-alert" size={12} />
					{proposal.acceptable.reason}
				</p>
			{/if}
			<!-- Who decides: one person, or the tagged reviewers, every one of them. -->
			{#if members.length > 1 || reviewed}
				<div class="mt-3 border-t border-brand-100 pt-2">
					{#if canEdit && members.length > 1}
						<MultiSelect
							values={[...proposal.reviewerIds]}
							options={memberOptions}
							placeholder="Reviewers"
							onchange={(reviewerIds) => run({ op: 'tag_reviewers', proposalId: proposal.id, reviewerIds })}
						/>
					{/if}
					{#if reviewed}
						<ul class="mt-2 flex flex-wrap gap-1.5">
							{#each proposal.reviewers as reviewer (reviewer.id)}
								<li>
									<Chip tone={reviewer.verdict === 'validated' ? 'success' : reviewer.verdict === 'invalidated' ? 'warning' : 'neutral'}>
										{reviewer.name}{reviewer.verdict ? `: ${reviewer.verdict}` : ''}
									</Chip>
								</li>
							{/each}
						</ul>
						<p class="mt-1 text-[0.6875rem] text-ink-400">Asked to look. Anyone with access to the project decides.</p>
					{/if}
				</div>
			{/if}
			{#if canEdit}
				<div class="mt-3 flex flex-wrap gap-2">
					<Button size="sm" disabled={busy || !proposal.acceptable.ok || !mayDecide} onclick={() => run({ op: 'decide_proposal', proposalId: proposal.id, decision: 'accept', ...(sense.trim() ? { sense: sense.trim() } : {}) })}>
						<Icon name="check" size={12} />
						Accept
					</Button>
					<Button size="sm" variant="outline" disabled={busy} onclick={reword}>Reword</Button>
					<Button size="sm" variant="ghost" disabled={busy || !mayDecide} onclick={refuse}>Refuse</Button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Only what tells something: a refusal and why, or a validation that moved; never "not validated" (ac-evo-form-question-state). -->
	{#if trail.validation === 'refused' || trail.validation === 'outdated' || trail.validation === 'changed_outside'}
		<p class="mt-3 flex items-start gap-1.5 text-xs {VALIDATION_LOOK.tone.text}"><Icon name={VALIDATION_LOOK.tone.icon} size={12} class="mt-0.5 shrink-0" />{VALIDATION_LOOK.text}</p>
	{/if}
	{#if (trail.gone ?? []).length > 0}
		<p class="mt-2 text-xs text-ink-400">{(trail.gone ?? []).map(nameOf).join(', ')} left the workspace: no longer waited on.</p>
	{/if}
	{#if versionsOpen}
		<div class="mt-3">
			<FieldVersionList
				{versions}
				{nameOf}
				drawn={answerBody ? { shown: shownVersion, onshow: (id) => (shownVersion = id) } : null}
				onrestore={canEdit && !answerBody && !behindDiagram ? restore : null}
			/>
		</div>
	{/if}
	<!-- The conversation on the field, on demand, under everything the card shows (ac-evo-fthread-look) -->
	{#if threadOpen}
		<FieldThread
			label={meta.label}
			messages={field.thread?.messages ?? []}
			{members}
			{actorId}
			{canComment}
			focusOnOpen={threadChoice === true}
			ask={live?.asker(() => ({ fieldPath: field.path, leafId: field.leafId ?? null })) ?? null}
			onpublish={live ? (messageId) => live.publish(messageId) : null}
			onpost={async (body, replyTo) => !!(await run({ op: 'post_on_field', body, ...(replyTo ? { replyTo } : {}) }))}
			ondecide={canEdit ? async (messageId, decision) => !!(await run({ op: 'decide_thread_suggestion', messageId, decision })) : null}
			onrule={async (messageId, ruling) =>
				!!(await run({ op: ruling === 'validated' ? 'validate_topic' : ruling === 'resolved' ? 'resolve_topic' : 'reopen_topic', messageId }))}
		/>
	{/if}
</article>
