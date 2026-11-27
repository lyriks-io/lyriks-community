<script lang="ts" module>
	import type { DossierFieldRow } from '$lib/server/evolution-view.server';

	/** One answer a section holds: a question of the Need, a text of a step of prose, an answer of a feature. */
	export interface SectionAnswer {
		readonly path: string;
		readonly leafId: string | null;
		readonly filled: boolean;
		readonly value: string;
		readonly trail?: DossierFieldRow['trail'];
		readonly thread?: DossierFieldRow['thread'];
	}
	/** A step validated as a whole along with the answers a section holds (the Functional and the Technical spec). */
	export interface SectionStep {
		readonly step: string;
		readonly validatedBy: readonly string[];
		readonly validated: boolean;
	}
</script>

<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import { Icon, confirmDialog, pushToast } from '$ui/design-system';
	import { personKey, prefillable, waitingQuestionOf, type FieldThreadMessage } from '$domain/evolution';
	import { initials } from '$ui/team/team-style';
	import BlockControls, { type Stamp, type ValidateLook } from './BlockControls.svelte';
	import FieldThread from './FieldThread.svelte';
	import LiveAiButton from './LiveAiButton.svelte';
	import { useLiveSession } from './live-session.svelte';
	import { personName } from './people';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { sectionStanding, sectionValidation, sectionWithdrawal } from './section-validation';
	import type { Patches } from './dossier-overlay';
	import { CARD, cardBorder, EDITING, ICON_BTN, ICON_BTN_ON, PRIMARY_44, REST, SECTION_TITLE, numberPill } from './evo-look';
	import { bringNextToValidate } from './evo-scroll';
	import { prefillTargetOf } from './prefill-target';
	import { followPlace, tabPlace, type FollowPlace } from './controls-follow';
	import FollowTab from './FollowTab.svelte';
	import { drawingFillHeight } from './section-drawing';

	/**
	 * One section of a step, the design's card: its number and title, the block
	 * controls, then what it says, read or edited. A section holds one or several
	 * answers of the request and validates them together: Validate signs every
	 * answer it holds (and the step it stands for, when it is validated as a
	 * whole), the stamps are the people behind all of them, and its comments are
	 * the topics opened on any of them, a new one landing on the first.
	 *
	 * Every act reads at once (ac-evo-form-edit-optimistic): the answers and the
	 * steps it is given are the page's, with what was just sent laid over them;
	 * Done closes the editor on what was written while it saves, and opens it
	 * again on what was typed if the save fails.
	 */
	interface Props {
		projectId: string;
		requestId: string;
		domId: string;
		number: string;
		title: string;
		answers: readonly SectionAnswer[];
		steps?: readonly SectionStep[];
		members: readonly { id: string; name: string; role?: string; jobs?: readonly string[] }[];
		actorId: string;
		canEdit: boolean;
		canValidate: boolean;
		canComment: boolean;
		/** Values proposed by an AI that wait on this section, said beside its title. */
		suggestions?: number;
		/** Why the section cannot be opened to edit now: suggestions of the AI wait on it (ac-evo-form-edit-suggestion). */
		editBlocked?: string | null;
		/** Why the platform would refuse to validate the section as it stands; its Validate reads disabled with it (criterion 8fa75115). */
		validateBlocked?: string | null;
		editing: boolean;
		/** A page Save owns these fields together; no section closes or saves them alone. */
		pageEditing?: boolean;
		onEdit: (on: boolean) => void;
		/** Saves what the editor holds, read at once on the page; false once the save failed, the editor then opening again. */
		onSave: () => Promise<boolean>;
		/** The section edited next, named on the editor's primary; `text` words a primary that leaves the step instead. */
		next?: { readonly label: string; readonly go: () => void; readonly text?: string } | null;
		read: Snippet;
		edit: Snippet;
		/**
		 * The section's drawing, offered as an option among its controls instead of
		 * a view of its own (ac-evo-sol-diagram-alone): shown in place of what it
		 * reads while `view.diagram` holds.
		 */
		diagram?: Snippet | null;
		view?: { readonly diagram: boolean; readonly toggle: () => void } | null;
	}
	let {
		projectId,
		requestId,
		domId,
		number,
		title,
		answers,
		steps = [],
		members,
		actorId,
		canEdit,
		canValidate,
		canComment,
		suggestions = 0,
		editBlocked = null,
		validateBlocked = null,
		editing,
		pageEditing = false,
		onEdit,
		onSave,
		next = null,
		read,
		edit,
		diagram = null,
		view = null
	}: Props = $props();

	const writes = useEvolutionWrites(untrack(() => projectId));
	const nameOf = (id: string) => personName(id, members);
	const same = (a: string, b: string) => personKey(a) === personKey(b);
	const has = (list: readonly string[], id: string) => list.some((x) => same(x, id));

	const filled = $derived(answers.filter((a) => a.filled));
	const validatorsOf = (a: SectionAnswer) => (a.trail?.validation === 'refused' ? [] : (a.trail?.validatedBy ?? []));
	/** Where the reader stands, the acts just sent included (ac-evo-form-edit-optimistic). */
	const standing = $derived(sectionStanding(answers, steps, actorId));
	/** The reader stands behind every answer the section holds, and every step it stands for. */
	const mine = $derived(standing.mine);
	/** Everyone it waits on validated every answer. */
	const settled = $derived(standing.settled);
	// Grey until the reader validated it, whatever comes next (ac-evo-form-validate-grey).
	const look = $derived<ValidateLook>(settled ? 'done' : mine ? 'mine' : 'grey');
	/** The reader can validate the section and has not: it is one of the blocks a validation brings into view next. */
	const waitsOnReader = $derived(canValidate && standing.waits);

	/** Sends operations on the request, read at once through `patches`; true once saved. */
	function send(operations: Record<string, unknown>[], what: string, patches: Patches = {}): Promise<boolean> {
		if (operations.length === 0) return Promise.resolve(true);
		return writes.send(patches, operations.map((op) => ({ requestId, ...op })), what);
	}
	const target = (a: SectionAnswer) => ({ fieldPath: a.path, ...(a.leafId ? { leafId: a.leafId } : {}) });

	async function validate() {
		const act = sectionValidation(answers, steps, actorId);
		const waiting = filled.filter((a) => !has(validatorsOf(a), actorId));
		// Complete once the reader was the last person the answers waited on.
		const complete = filled.every((a) => a.trail?.validation === 'validated' || waiting.includes(a)) && waiting.every((a) => (a.trail?.expected ?? []).every((id) => same(id, actorId) || has(validatorsOf(a), id)));
		const sent = send(act.operations, `your validation of “${title}”`, act.patches);
		// The next block to validate comes into view at once, while the validation saves (ac-evo-form-validate-next).
		bringNextToValidate(domId);
		// The section shows its own validation; a message only says it now stands signed off by everyone (criterion 8b431894).
		if ((await sent) && complete) pushToast({ level: 'success', message: 'Section fully validated: all approvers signed off' });
	}
	async function withdraw() {
		const act = sectionWithdrawal(answers, steps, actorId);
		// One click would undo several answers at once: it asks first (criterion c4c63bdd).
		const answersGiven = act.operations.filter((o) => o.op === 'withdraw_field_verdict').length;
		if (answersGiven > 1 && !(await confirmDialog({ title: 'Take back your validation?', message: `The ${answersGiven} answers of “${title}” go back to validate.`, confirmLabel: 'Take it back', cancelLabel: 'Keep it' }))) return;
		await send(act.operations, `the withdrawal of your validation of “${title}”`, act.patches);
	}

	/** One round mark per person behind the section: green once they validated all of it, dashed while it waits on them. */
	const stamps = $derived.by((): Stamp[] => {
		const people: string[] = [];
		const add = (id: string) => !has(people, id) && people.push(id);
		for (const a of filled) {
			for (const id of a.trail?.expected ?? []) add(id);
			for (const id of validatorsOf(a)) add(id);
		}
		for (const s of steps) for (const id of s.validatedBy) add(id);
		// Nobody named and nobody behind it yet: the reader is the one it waits on.
		if (people.length === 0 && canValidate && filled.length > 0) add(actorId);
		return people.map((id) => {
			const ok = filled.every((a) => has(validatorsOf(a), id)) && steps.every((s) => has(s.validatedBy, id));
			// Validated by the person's AI under their delegation (ac-evo-llm-delegation-marks).
			const ai = ok && filled.some((a) => has(a.trail?.validatedByAi ?? [], id));
			const name = ai ? `${nameOf(id)}'s AI` : nameOf(id);
			// The reader's own box comes first and is where they validate (criterion 32265cea of feat-34).
			const me = same(id, actorId);
			return {
				id,
				initials: me ? 'YOU' : initials(nameOf(id)),
				ok,
				ai,
				me,
				name,
				// The avatars only say who validated: only Validate validates (ac-evo-form-validators).
				title: `${name}${ok ? ' · validated' : ' · to validate'}`
			};
		});
	});

	// A validation already given can always be taken back; one still to give waits while the platform would refuse it.
	const held = $derived(!mine && !settled && filled.length > 0 ? validateBlocked : null);
	const validateControl = $derived({
		look,
		title: mine ? 'You validated this section · click to withdraw' : filled.length === 0 ? 'Nothing to validate yet' : (held ?? 'Validate this section'),
		held,
		run: !canValidate || filled.length === 0 || held ? null : mine ? () => void withdraw() : settled ? null : () => void validate(),
		withdraws: mine,
		what: 'this section',
		stamps,
		settled
	});

	/** Every topic opened on the answers of the section, read as one thread. */
	const messages = $derived([...answers.flatMap((a) => a.thread?.messages ?? [])].sort((x, y) => x.postedAt.localeCompare(y.postedAt)));
	const ownerOf = (messageId: string) => answers.find((a) => a.thread?.messages.some((m) => m.id === messageId)) ?? answers[0];
	const openTopics = $derived(messages.filter((m) => !m.replyTo && m.ruling?.state !== 'resolved').length);
	const resolvedTopics = $derived(messages.filter((m) => !m.replyTo && m.ruling?.state === 'resolved').length);
	let commentsOpen = $state(false);
	// A question the reader's AI waits on opens the comments once, so it is never left to be noticed (ac-evo-live-one-box).
	const aiWaits = $derived(waitingQuestionOf(messages as FieldThreadMessage[], actorId));
	let openedFor = $state<string | null>(null);
	$effect(() => {
		const question = aiWaits;
		untrack(() => {
			if (!question || !canComment || openedFor === question.id) return;
			openedFor = question.id;
			commentsOpen = true;
		});
	});

	/**
	 * What the reader's AI can be asked here, in a live session (feat-evo-live-session):
	 * Prefill every question of the section from the first one left empty, never
	 * a step's description, which stays in the person's own words, nor its
	 * diagram, which Draw with my AI redraws; Ask in the section's thread.
	 */
	const live = useLiveSession();
	const questions = $derived(answers.filter((a) => prefillable(a.path)));
	// The click bears on the first question left empty and covers every question of the section (ac-evo-live-prefill).
	const prefillTarget = $derived(prefillTargetOf(answers));
	// A prefill of the whole step on this section closes its editor as the section's own Prefill does, what was typed saved first.
	const walkedHere = $derived(live?.stepPrefill?.state === 'running' && live.stepPrefill.sectionId === domId);
	$effect(() => {
		if (walkedHere && editing && !pageEditing) untrack(() => void closeEditing());
	});
	const ask = $derived(
		live?.asker((replyTo) => {
			const owner = replyTo ? ownerOf(replyTo) : answers[0];
			return { fieldPath: owner.path, leafId: owner.leafId };
		}) ?? null
	);

	// Opened to edit, by the reader or by the page, the section puts the caret in its first field (189c4d88).
	let editArea: HTMLDivElement | undefined = $state();
	$effect(() => {
		const area = editArea;
		if (area && !pageEditing) untrack(() => area.querySelector<HTMLElement>('textarea, input:not([type="hidden"]), select')?.focus({ preventScroll: true }));
	});

	/**
	 * Done: the editor closes at once on what was written, which the page reads
	 * while it saves (ac-evo-form-edit-optimistic); `then` moves on at once too. A
	 * save that fails opens the editor again on what was typed, the page having
	 * kept it. Prefill waits for the save, so the AI reads what was typed
	 * (ac-evo-form-edit-suggestion).
	 */
	async function closeEditing(then: (() => void) | null = null): Promise<boolean> {
		const saving = onSave();
		onEdit(false);
		then?.();
		if (await saving) return true;
		onEdit(true);
		return false;
	}

	async function toggleEdit() {
		if (!editing) return onEdit(true);
		if (await closeEditing()) pushToast({ level: 'success', message: 'Changes saved' });
	}
	async function saveThenNext() {
		if (await closeEditing(next ? () => next.go() : null)) pushToast({ level: 'success', message: next && !next.text ? `Saved · change to “${next.label}”` : 'Changes saved' });
	}

	/*
	 * The controls follow a long section (ac-evo-form-controls-follow): once its
	 * header has scrolled under the page's sticky bars while what they validate
	 * is still on screen, the same controls show in a tab stretched out of its
	 * right edge. What they validate ends at the card's bottom, or at the bottom
	 * of a `[data-controls-cover]` block when items below it carry their own
	 * controls (3.3 Journey: the drawing, then its paths).
	 */
	let cardEl = $state<HTMLElement | null>(null);
	let headerEl = $state<HTMLElement | null>(null);
	/** Where the tab shows, null while the header is in view or once the section has scrolled past. */
	let follow = $state<FollowPlace | null>(null);
	/** Where the tab sits against the section, shown or not: it leaves from there, glued to the section. */
	let place = $state<FollowPlace | null>(null);
	let tabHeight = $state(120);
	let frame = $state({ border: 'transparent', width: 1, bg: 'var(--color-surface)' });
	/** The page's scroller the card lives in. */
	function scrollerOf(node: HTMLElement): HTMLElement | null {
		for (let el = node.parentElement; el; el = el.parentElement) {
			const style = getComputedStyle(el);
			if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
		}
		return null;
	}
	/** The bottom of every bar that sticks above the content: the app bar (where the page's scroller starts) and the request's own header. */
	function stickyBottom(node: HTMLElement): number {
		let bottom = scrollerOf(node)?.getBoundingClientRect().top ?? 0;
		const head = document.getElementById('evo-head');
		if (head && getComputedStyle(head).position === 'sticky') bottom = Math.max(bottom, head.getBoundingClientRect().bottom);
		return bottom;
	}
	function measure() {
		if (!cardEl || !headerEl) return;
		const card = cardEl.getBoundingClientRect();
		const cover = cardEl.querySelector('[data-controls-cover]')?.getBoundingClientRect();
		const style = getComputedStyle(cardEl);
		frame = { border: style.borderRightColor, width: parseFloat(style.borderRightWidth) || 1, bg: style.backgroundColor };
		const input = {
			header: headerEl.getBoundingClientRect(),
			card: { top: card.top, bottom: cover?.bottom ?? card.bottom, right: card.right },
			stickyBottom: stickyBottom(cardEl),
			viewport: { width: document.documentElement.clientWidth },
			tab: { width: 36, height: tabHeight }
		};
		follow = followPlace(input);
		place = tabPlace(input);
	}
	$effect(() => {
		let raf = 0;
		const schedule = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(measure);
		};
		window.addEventListener('scroll', schedule, { capture: true, passive: true });
		window.addEventListener('resize', schedule, { passive: true });
		schedule();
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('scroll', schedule, { capture: true });
			window.removeEventListener('resize', schedule);
		};
	});

	/*
	 * The diagram shown (ac-evo-sol-diagram-alone): the page scrolls to the
	 * card's top, under the sticky header, and the drawing takes all the height
	 * the window leaves under it, as the feature menu of the Specification 360°
	 * fills the window; the diagrams read the height as `--diagram-fill`.
	 */
	const UNDER_HEADER_GAP = 12;
	let drawingEl = $state<HTMLElement | null>(null);
	const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	function fitDrawing() {
		const scroller = cardEl && scrollerOf(cardEl);
		const canvas = drawingEl?.querySelector<HTMLElement>('[role="application"]');
		if (!cardEl || !drawingEl || !scroller || !canvas) return;
		const fill = drawingFillHeight({
			windowBottom: scroller.getBoundingClientRect().bottom,
			under: stickyBottom(cardEl) + UNDER_HEADER_GAP,
			cardHeight: cardEl.offsetHeight,
			drawingHeight: canvas.offsetHeight
		});
		drawingEl.style.setProperty('--diagram-fill', `${fill}px`);
	}
	$effect(() => {
		if (!view?.diagram || !drawingEl) return;
		// Once the drawing has laid itself out, then at every change of the window.
		let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(fitDrawing)));
		const refit = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(fitDrawing);
		};
		window.addEventListener('resize', refit, { passive: true });
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', refit);
		};
	});
	async function toggleView() {
		if (!view) return;
		const showing = !view.diagram;
		view.toggle();
		if (!showing) return;
		await tick();
		requestAnimationFrame(() => {
			const scroller = cardEl && scrollerOf(cardEl);
			if (!cardEl || !scroller) return;
			const by = cardEl.getBoundingClientRect().top - (stickyBottom(cardEl) + UNDER_HEADER_GAP);
			if (Math.abs(by) > 1) scroller.scrollBy({ top: by, behavior: reducedMotion() ? 'auto' : 'smooth' });
		});
	}
</script>

{#snippet controls(compact: boolean)}
	{#if prefillTarget && canComment && !pageEditing}<LiveAiButton kind="prefill" {compact} target={prefillTarget} watch={questions.map((a) => ({ fieldPath: a.path, leafId: a.leafId }))} before={editing ? () => closeEditing() : null} />{/if}
	{#if view && diagram}
		<!-- The drawing is an option of the section, not a view of the tab (ac-evo-sol-diagram-alone). -->
		<button
			type="button"
			class="relative grid {compact ? 'size-7' : 'size-9'} place-items-center rounded-lg {view.diagram ? ICON_BTN_ON : `${ICON_BTN} text-ink`}"
			aria-pressed={view.diagram}
			aria-label={view.diagram ? 'Show as a list' : 'Show as a diagram'}
			title={view.diagram ? 'Show as a list' : 'Show as a diagram'}
			onclick={() => void toggleView()}
		>
			<Icon name={view.diagram ? 'list' : 'workflow'} size={16} />
		</button>
	{/if}
	<BlockControls
		{compact}
		edit={canEdit && !pageEditing ? { on: editing, toggle: () => void toggleEdit(), blocked: editBlocked } : null}
		comments={canComment ? { count: openTopics, resolvedOnly: openTopics === 0 && resolvedTopics > 0, open: commentsOpen, toggle: () => (commentsOpen = !commentsOpen) } : null}
		validate={validateControl}
	/>
{/snippet}

<div id={domId} bind:this={cardEl} class="{CARD} group/section scroll-mt-36 {cardBorder(settled)} {editing ? EDITING : REST}" data-evo-waits={waitsOnReader || null}>
	<div bind:this={headerEl} class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex flex-wrap items-center gap-3">
			<span class={numberPill(settled)}>{settled ? '✓' : number}</span>
			<h3 class={SECTION_TITLE}>{title}</h3>
			{#if suggestions > 0}<span class="font-evo-mono text-xs text-violet-ink">· {suggestions} suggestion(s) to validate</span>{/if}
		</div>
		<span class="flex flex-wrap items-center gap-1.5">{@render controls(false)}</span>
	</div>
	<!-- The section's own controls, in a tab of its frame while its header is out of view (ac-evo-form-controls-follow). -->
	<FollowTab open={follow !== null} {place} {frame} height={tabHeight} onheight={(h) => (tabHeight = h)} label={title}>
		<span class="flex flex-col items-center gap-1">{@render controls(true)}</span>
	</FollowTab>
	{#if editing}
		<div class="animate-lk-fade flex flex-col gap-3" bind:this={editArea}>
			{@render edit()}
			{#if pageEditing && diagram}<div class="min-w-0">{@render diagram()}</div>{/if}
			{#if !pageEditing}<div class="flex flex-wrap justify-end gap-2">
				<button type="button" class={PRIMARY_44} onclick={() => void saveThenNext()}>{next ? (next.text ?? `Done, then edit: ${next.label} →`) : 'Done'}</button>
			</div>{/if}
		</div>
	{:else if view?.diagram && diagram}
		<div class="min-w-0 animate-lk-fade" bind:this={drawingEl}>{@render diagram()}</div>
	{:else}
		{@render read()}
	{/if}
	{#if commentsOpen && canComment}
		<FieldThread
			label={title}
			{messages}
			{members}
			{actorId}
			{canComment}
			focusOnOpen
			onpost={(body, replyTo) => {
				const owner = replyTo ? ownerOf(replyTo) : answers[0];
				return send([{ op: 'post_on_field', ...target(owner), body, ...(replyTo ? { replyTo } : {}) }], replyTo ? 'your reply' : 'your comment');
			}}
			{ask}
			onpublish={live ? (messageId) => live.publish(messageId) : null}
			onrule={(messageId, ruling) =>
				send(
					[{ op: ruling === 'validated' ? 'validate_topic' : ruling === 'resolved' ? 'resolve_topic' : 'reopen_topic', ...target(ownerOf(messageId)), messageId }],
					ruling === 'open' ? 'the reopening of the comment' : `the comment ${ruling}`
				)}
		/>
	{/if}
</div>
