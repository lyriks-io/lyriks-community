<script lang="ts" module>
	/** One person's round mark: green once they validated, dashed while they are waited on. */
	export interface Stamp {
		readonly id: string;
		readonly initials: string;
		readonly title: string;
		readonly ok: boolean;
		readonly onclick?: (() => void) | null;
		/** The person's AI gave this validation under their delegation: the stamp carries the AI sparkle (ac-evo-llm-delegation-marks). */
		readonly ai?: boolean;
		/** The person's name, for the tooltips that name who is awaited; read from `title` when absent. */
		readonly name?: string;
		/** The stamp is the reader's own. */
		readonly me?: boolean;
		/**
		 * Asked before `onclick` runs (criterion 8d6c8ec0): a stray click on initials never validates
		 * nor pings anyone. `question` reads in the box, `act` on its confirming button.
		 */
		readonly confirm?: { readonly question: string; readonly act: string } | null;
	}
	/**
	 * Where a block's Validate stands: `grey` until the reader validated it,
	 * drawn as the filled blue button; `mine` and `done` read in green, the
	 * reader's own validation or everyone's. The one Validate that is the
	 * page's next action is marked on its own, from the page (evo-scroll
	 * `watchNextToValidate`), so no block has to know its rank; `next` stays
	 * for a page that names it itself.
	 */
	export type ValidateLook = 'grey' | 'mine' | 'done' | 'next';
	/** The landed change request an element stands validated through (EVO-002): its key opens the request. */
	export interface ThroughControl {
		readonly label: string;
		readonly key: string;
		readonly href: string;
		/** Who approved the request and when. */
		readonly detail: string;
		/** Takes that validation back; null when the reader is not among the people the element waits on. */
		readonly withdraw: (() => void) | null;
	}
	export interface ValidateControl {
		/** The server has not confirmed the requested validation change yet. */
		readonly saving?: boolean;
		/** What is validated, as the reader's own box asks it: Validate <what>? (criterion 8d6c8ec0). */
		readonly what?: string;
		readonly look: ValidateLook;
		readonly title: string;
		/** What the reader's own pending box says on hover, where the page names its act otherwise (Accept); You · click to validate by default. */
		readonly validateTip?: string;
		/** Why the platform would refuse this validation for now, said instead of who it waits on. */
		readonly held?: string | null;
		readonly run: (() => void) | null;
		/** A click on the reader's own green box takes their validation back, after a confirmation. */
		readonly withdraws?: boolean;
		/** What the reader's own green box asks before it takes the validation back (EVO-007); Withdraw your validation? otherwise. */
		readonly withdrawConfirm?: { readonly question: string; readonly act: string } | null;
		readonly stamps: readonly Stamp[];
		/** Every person waited on validated: the pill sits on green. */
		readonly settled: boolean;
		/**
		 * Whose validation the element still waits on, when the page knows it (criterion aba60be7): the reader's
		 * ('me', Validate), only others' ('others', Waiting for N), nobody's (null, Validated). Absent, it is read
		 * from `look`: grey and next await the reader, mine waits on the others still unticked, done is validated.
		 */
		readonly awaits?: 'me' | 'others' | null;
		/** Validated through a landed change request, while that validation stands (criterion a6174f4b). */
		readonly through?: ThroughControl | null;
	}
	export interface CommentControl {
		/** Topics not resolved. */
		readonly count: number;
		/** Whether resolved topics exist when none is left open: the icon reads green. */
		readonly resolvedOnly: boolean;
		readonly open: boolean;
		/**
		 * Gets the click that asked for it: a card grid moves from the card it came from. What it answers is
		 * awaited, so a grid answers once it laid the card out and the comments are brought where they end up.
		 */
		readonly toggle: (event?: MouseEvent) => unknown;
	}
	/** The sources a block rests on (criterion b0ea9889): how many, and whether they are open at its foot. */
	export interface SourcesControl {
		readonly count: number;
		readonly open: boolean;
		readonly toggle: () => void;
	}
	export interface EditControl {
		readonly on: boolean;
		/** Gets the click that asked for it: a card grid moves from the card it came from. */
		readonly toggle: (event?: MouseEvent) => void;
		/** Why the section cannot be opened to edit now; the pencil reads disabled with it. */
		readonly blocked?: string | null;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '$ui/design-system';
	import { toggleCommentsInView } from '$ui/shell/comments-in-view';
	import { celebrateValidation } from './validate-motion';
	import { AVATAR_OK, AVATAR_PENDING, COUNT, ICON_BTN, ICON_BTN_ON } from './evo-look';
	import { validationView } from './validation-view';
	import { stepSettled } from './step-settled';

	/**
	 * The controls of a block, one component everywhere (the design's fixed rule):
	 * the pencil, the comments with their count, the sources it rests on with
	 * theirs where it cites any, then one box per person who stands behind the
	 * block, the reader's first: there is no Validate apart from them, each person
	 * validates in their own box after a confirmation (criteria c035755f, 8d6c8ec0
	 * of feat-164, 32265cea of feat-34). `between` sits before the people, where a
	 * row offers Reject; `add` closes them, the + that asks a colleague. `compact`
	 * draws the reader's box and the count as a narrow strip, for the tab that
	 * follows a long section beside it (ac-evo-form-controls-follow). `icons` draws
	 * the Specification 360°'s acts of an element, one size each, always in this
	 * order: `reject` (the cross), the comments, the sources (greyed at 0), then the people.
	 */
	interface Props {
		edit?: EditControl | null;
		comments?: CommentControl | null;
		sources?: SourcesControl | null;
		validate?: ValidateControl | null;
		between?: Snippet;
		disabled?: boolean;
		compact?: boolean;
		/** The group sits at the end of its row, or in the bottom right corner of its card (criterion aba60be7). */
		end?: boolean;
		/** The four acts as icons (criterion a4ef7658), the Specification 360°'s; the pill in words otherwise. */
		icons?: boolean;
		/** The cross of the four acts, drawn by the page (RejectAct), before the check. */
		reject?: Snippet;
		/** The acts close the text of the element a page's head is about: 28 px squares on the text's line, never pushed aside (criterion a4ef7658). */
		small?: boolean;
		/** The + box after the people, that asks a colleague to validate (criterion 3b1c77a6). */
		add?: Snippet;
	}
	let { edit = null, comments = null, sources = null, validate = null, between, disabled = false, compact = false, end = false, icons = false, reject, small = false, add }: Props = $props();
	// The four acts share the compact 28 px height throughout the reading pages (criterion a4ef7658).
	const SQUARE = 'size-7';
	const TALL = 'h-7';
	const ICON = 14;
	const view = $derived(validate ? validationView(validate) : null);
	// A validated step keeps the people who stand behind the block, never a box to press (criterion f97d4509).
	const settled = stepSettled();
	const peopleOnly = $derived(!!validate && settled());
	/** The initials whose act waits for its confirmation, or the check's withdrawal (WITHDRAWING), if any. */
	let confirming = $state<string | null>(null);
	// Never a person's id: theirs are emails and ids.
	const WITHDRAWING = ' withdraw';
	const WITHDRAW_ASK = { question: 'Withdraw your validation?', act: 'Withdraw' } as const;
	// A stray click confirms nothing (criteria 8d6c8ec0, EVO-007); Escape or a click outside the box and its button cancels.
	function dismissOutside(node: HTMLElement) {
		const outside = (e: PointerEvent) => { if (!node.parentElement?.contains(e.target as Node)) confirming = null; };
		const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') confirming = null; };
		window.addEventListener('pointerdown', outside, true);
		window.addEventListener('keydown', escape);
		return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape); };
	}
	function pressStamp(stamp: Stamp, target: HTMLElement) {
		if (stamp.confirm) {
			confirming = confirming === stamp.id ? null : stamp.id;
			return;
		}
		runStamp(stamp, target);
	}
	function runStamp(stamp: Stamp, _target: HTMLElement) {
		confirming = null;
		stamp.onclick?.();
	}
	// The comments open where the reader sees them, the block's foot below the window included (criterion 8cb972b5).
	function toggleComments(event: MouseEvent) {
		const control = comments;
		if (control) void toggleCommentsInView(() => control.toggle(event), event.currentTarget as HTMLElement);
	}
	const sourcesLabel = (s: SourcesControl) => (s.open ? 'Hide the sources' : `${s.count} ${s.count === 1 ? 'source' : 'sources'}`);

	// A validation the reader can take back: their own box asks first, then takes it back (EVO-007).
	const undoable = $derived(!!validate?.withdraws && !!validate.run && view?.state !== 'validate');
	/**
	 * The reader's own box (criterion 8d6c8ec0): theirs among the people, else one drawn for them while they may
	 * validate. It is where they validate, after a confirmation, and where they take their validation back; there is
	 * no other Validate (field report 2026-11-25).
	 */
	const OWN = ' own';
	const own = $derived.by((): Stamp | null => {
		if (!validate || !view) return null;
		const mine = validate.stamps.find((stamp) => stamp.me);
		if (mine) return mine;
		return view.state === 'validate' || undoable || validate.look === 'mine' ? { id: OWN, initials: 'YOU', title: 'You', ok: validate.look === 'mine', me: true, name: 'You' } : null;
	});
	/** What a click on the reader's own box does: validate it, take their validation back, or nothing. */
	const ownAct = $derived<'validate' | 'withdraw' | null>(peopleOnly || !validate?.run || validate.saving ? null : view?.state === 'validate' ? 'validate' : undoable ? 'withdraw' : null);
	const ownAsk = $derived(
		ownAct === 'validate'
			? (own?.confirm ?? { question: `${validateWords(validate)}?`, act: 'Validate' })
			: ownAct === 'withdraw'
				? (validate?.withdrawConfirm ?? WITHDRAW_ASK)
				: null
	);
	const ownTip = $derived(validate?.saving ? 'Saving your validation' : ownAct === 'validate' ? (validate!.validateTip ?? 'You · click to validate') : ownAct === 'withdraw' ? validate!.title : own?.ok ? 'You · validated' : (view?.title ?? ''));
	/** What validating says, asked before it runs: Validate <what>, else the control's own Validate words. */
	function validateWords(control: ValidateControl | null): string {
		if (control?.what?.trim()) return `Validate ${control.what.trim()}`;
		return control?.title.startsWith('Validate') ? control.title : 'Validate this';
	}
	/** The others, at most three boxes then +N, the reader apart (criterion 8d6c8ec0). */
	const others = $derived(view ? view.shown.filter((stamp) => !stamp.me) : []);
	function runOwn(button: HTMLElement) {
		confirming = null;
		if (ownAct === 'validate') celebrateValidation(button, button.closest<HTMLElement>('[data-people]'));
		validate?.run?.();
	}

	const CHIP = 'relative grid size-7 flex-none place-items-center border-[1.5px] text-[0.625rem] transition-colors duration-300';
	// One person's box: a check above their initials, dashed while awaited, green once they validated (criterion 8d6c8ec0).
	const BOX = 'relative inline-flex h-7 min-w-7 flex-none flex-col items-center justify-center gap-px border-[1.5px] px-1 text-[0.5rem] leading-none transition-colors duration-300';
</script>

{#snippet strip()}
	<!-- The same acts as the header's, one 28 px target each, stacked (ac-evo-form-controls-follow). -->
	<span class="flex flex-none flex-col items-center gap-1">
		{#if edit}
			<button
				type="button"
				class="grid size-7 place-items-center rounded-lg {edit.on ? ICON_BTN_ON : `${ICON_BTN} text-ink`}"
				aria-pressed={edit.on}
				aria-label={edit.on ? 'Close editing' : edit.blocked ? `Edit this section: ${edit.blocked}` : 'Edit this section'}
				title={edit.on ? 'Close editing' : (edit.blocked ?? 'Edit this section')}
				disabled={disabled || (!edit.on && !!edit.blocked)}
				onclick={edit.toggle}
			>
				<Icon name="pencil" size={16} />
			</button>
		{/if}
		{#if comments}
			<button
				type="button"
				class="relative grid size-7 place-items-center rounded-lg {comments.open
					? ICON_BTN_ON
					: comments.count > 0
						? `${ICON_BTN} text-orange-ink`
						: comments.resolvedOnly
							? `${ICON_BTN} text-green-ink`
							: `${ICON_BTN} text-ink`}"
				aria-label={comments.open ? 'Hide the comments' : comments.count > 0 ? `Comments: ${comments.count} open` : 'Comments'}
				title={comments.open ? 'Hide the comments' : 'Comments'}
				aria-expanded={comments.open}
				onclick={toggleComments}
			>
				<Icon name="message-circle" size={16} />
				{#if comments.count > 0}<span aria-hidden="true" class="absolute -top-0.5 -right-0.5 min-w-3.5 px-0.5 text-[0.5625rem] leading-3.5 {COUNT}">{comments.count}</span>{/if}
			</button>
		{/if}
		{#if sources}
			<button
				type="button"
				class="relative grid size-7 place-items-center rounded-lg {sources.open ? ICON_BTN_ON : `${ICON_BTN} text-ink`}"
				aria-label={sourcesLabel(sources)}
				title={sourcesLabel(sources)}
				aria-expanded={sources.open}
				onclick={sources.toggle}
			>
				<Icon name="book" size={16} />
				<span aria-hidden="true" class="absolute -top-0.5 -right-0.5 min-w-3.5 bg-toner-2 px-0.5 font-evo-mono text-[0.5625rem] leading-3.5 font-bold text-ink">{sources.count}</span>
			</button>
		{/if}
		{#if validate && view}
			<!-- The reader's own box, as beside the section (criterion 8d6c8ec0), then how many validated. -->
			{#if own}{@render people()}{/if}
			{#if validate.stamps.length > 1}
				{@const ok = validate.stamps.filter((s) => s.ok).length}
				<span class="font-evo-mono text-[0.625rem] font-bold {ok === validate.stamps.length ? 'text-green-ink' : 'text-evo-muted'}" title={validate.stamps.map((s) => s.title).join('\n')} role="img" aria-label="{ok} of {validate.stamps.length} validated">{ok}/{validate.stamps.length}</span>
			{/if}
		{/if}
	</span>
{/snippet}

{#snippet confirmation(ask: { readonly question: string; readonly act: string }, run: (e: MouseEvent & { currentTarget: HTMLButtonElement }) => void)}
	<!-- Under what it confirms: its act runs only from here (criteria 8d6c8ec0, EVO-007). -->
	<span role="dialog" aria-label={ask.question} data-confirm
		class="absolute top-full right-0 z-40 mt-1 flex w-max max-w-[280px] flex-col gap-2 border-[1.5px] border-ink bg-paper p-2.5 text-left text-[0.8125rem] text-ink shadow-lg"
		{@attach dismissOutside}>
		<span class="font-semibold">{ask.question}</span>
		<span class="flex justify-end gap-1.5">
			<button type="button" class="border-[1.5px] border-ink bg-paper px-2 py-0.5 text-[0.75rem] font-semibold hover:bg-toner-1" onclick={() => (confirming = null)}>Cancel</button>
			<button type="button" class="border-[1.5px] border-ink bg-ink px-2 py-0.5 text-[0.75rem] font-semibold text-paper hover:opacity-90" data-confirm-act onclick={run}>{ask.act}</button>
		</span>
	</span>
{/snippet}

{#snippet stampFace(stamp: Stamp, saving = false)}
	<Icon name={saving ? 'clock' : 'check'} size={9} /><span data-stamp-initials class="font-evo-mono font-bold">{stamp.initials}</span>{#if stamp.ai}<span class="absolute -right-1 -bottom-1 grid size-3.5 place-items-center bg-violet-ink text-paper ring-2 ring-paper" aria-hidden="true"><Icon name="sparkles" size={8} /></span>{/if}
{/snippet}

{#snippet people()}
{#if view && (own || others.length > 0 || view.more > 0 || add)}
	<!-- One box per person, the reader's first: their own validates and withdraws after a confirmation, someone else's
	     pending one sends a reminder, then +N and the + that asks a colleague (criteria 8d6c8ec0, c035755f, 3b1c77a6). -->
	<span class="flex flex-none items-center gap-2" data-people>
		{#if own}
			{@const look = `${BOX} ${own.ok || validate?.look === 'mine' ? AVATAR_OK : AVATAR_PENDING}`}
			{#if ownAct && ownAsk}
				<span class="relative inline-flex">
					<button type="button" class="{look} hover:border-solid hover:border-ink hover:text-ink disabled:cursor-default" title={ownTip} aria-label="{view.label}: {ownTip}" aria-haspopup="dialog" aria-expanded={confirming === OWN}
						data-evo-validate data-validation-state={view.state} data-stamp-ok={own.ok || validate?.look === 'mine'} data-own-box {disabled}
						onclick={() => (confirming = confirming === OWN ? null : OWN)}>{@render stampFace(own)}</button>
					{#if confirming === OWN}
						{@render confirmation(ownAsk, (e) => runOwn((e.currentTarget.closest('.relative') as HTMLElement | null)?.querySelector('button') ?? e.currentTarget))}
					{/if}
				</span>
			{:else if view.state === 'validate' && !peopleOnly}
				<!-- Awaited but held: the box says why and cannot be pressed until that is settled. -->
				<button type="button" class="{look} disabled:cursor-default" title={ownTip} aria-label="{view.label}: {ownTip}" data-evo-validate data-validation-state={view.state} data-stamp-ok="false" data-own-box disabled
					>{@render stampFace(own, !!validate?.saving)}</button
				>
			{:else}
				<span class={look} role="status" title={ownTip} aria-label="{view.label}: {ownTip}" data-validation-state={view.state} data-stamp-ok={own.ok || validate?.look === 'mine'} data-own-box
					>{@render stampFace(own, !!validate?.saving)}</span
				>
			{/if}
		{/if}
		{#each others as stamp (stamp.id)}
			{@const look = `${BOX} ${stamp.ok ? AVATAR_OK : AVATAR_PENDING}`}
			<!-- Someone else's box is a button only when it does something: a reminder, asked first (criterion 8d6c8ec0). -->
			{#if stamp.onclick}
				<span class="relative inline-flex">
					<button type="button" class={look} title={stamp.title} aria-label={stamp.title} aria-haspopup={stamp.confirm ? 'dialog' : undefined} aria-expanded={stamp.confirm ? confirming === stamp.id : undefined} data-stamp-ok={stamp.ok} {disabled} onclick={(e) => pressStamp(stamp, e.currentTarget)}
						>{@render stampFace(stamp)}</button
					>
					{#if stamp.confirm && confirming === stamp.id}
						{@render confirmation(stamp.confirm, (e) => runStamp(stamp, e.currentTarget))}
					{/if}
				</span>
			{:else}
				<span class={look} title={stamp.title} role="img" aria-label={stamp.title} data-stamp-ok={stamp.ok}>{@render stampFace(stamp)}</span>
			{/if}
		{/each}
		{#if view.more > 0}
			<!-- The others fold into one chip that names every person with where they stand (criterion 8d6c8ec0). -->
			<span class="{CHIP} border-evo-line bg-paper font-evo-mono font-bold text-ink-2" title={view.people} role="img" aria-label="{view.more} more: {view.people}" data-stamp-more
				>+{view.more}</span
			>
		{/if}
		{@render add?.()}
	</span>
{/if}
{/snippet}

{#snippet acts()}
	<!-- The acts of an element of the Specification 360° (criterion c035755f): the cross, the comments, the sources, one
	     28 px square each, always in this order; then one box per person, where each validates their own, and the +. -->
	<!-- Small, they close the text of the element a page's head is about, on its line (criteria 14a1164c, a4ef7658). -->
	<span class="{small ? 'ml-1.5 inline-flex flex-none flex-wrap items-center gap-1 align-middle' : `flex items-center gap-1.5 ${end ? 'ml-auto min-w-0 max-w-full flex-[0_1_auto] flex-wrap justify-end gap-y-1' : 'flex-none'}`}" data-four-acts data-four-acts-small={small || undefined}>
		{#if edit}
			<button
				type="button"
				class="grid {SQUARE} place-items-center rounded-lg {edit.on ? ICON_BTN_ON : `${ICON_BTN} text-ink`}"
				aria-pressed={edit.on}
				aria-label={edit.on ? 'Close editing' : edit.blocked ? `Edit this section: ${edit.blocked}` : 'Edit this section'}
				title={edit.on ? 'Close editing' : (edit.blocked ?? 'Edit this section')}
				disabled={disabled || (!edit.on && !!edit.blocked)}
				onclick={edit.toggle}
			>
				<Icon name="pencil" size={ICON} />
			</button>
		{/if}
		{@render between?.()}
		{@render reject?.()}
		{#if comments}
			<button
				type="button"
				class="flex {TALL} items-center gap-1 rounded-lg px-2 font-evo-mono text-[0.8125rem] font-bold transition-colors duration-200 {comments.open
					? ICON_BTN_ON
					: comments.count > 0
						? `${ICON_BTN} text-orange-ink`
						: comments.resolvedOnly
							? `${ICON_BTN} text-green-ink`
							: `${ICON_BTN} text-ink`}"
				aria-label={comments.open ? 'Hide the comments' : 'Comments'}
				title={comments.open ? 'Hide the comments' : 'Comments'}
				aria-expanded={comments.open}
				onclick={toggleComments}
			>
				<Icon name="message-circle" size={ICON} />
				{#if comments.count > 0}{comments.count}{/if}
			</button>
		{/if}
		{#if sources}
			<button
				type="button"
				class="flex {TALL} items-center gap-1 rounded-lg px-2 font-evo-mono text-[0.8125rem] font-bold transition-colors duration-200 disabled:cursor-default disabled:text-ink-4 {sources.open ? ICON_BTN_ON : `${ICON_BTN} text-ink`}"
				aria-label={sources.count === 0 ? 'No source cited' : sourcesLabel(sources)}
				title={sources.count === 0 ? 'No source cited' : sourcesLabel(sources)}
				aria-expanded={sources.count === 0 ? undefined : sources.open}
				disabled={sources.count === 0}
				onclick={sources.toggle}
			>
				<Icon name="book" size={ICON} />{#if sources.count > 0}{sources.count}{/if}
			</button>
		{/if}
		{#if validate && view}{@render people()}{/if}
		{#if validate?.through}
			{@const through = validate.through}
			<!-- Validated through the request that delivered it (criterion a6174f4b): the key opens the request. -->
			<span class="inline-flex {TALL} flex-none items-center gap-1 border-[1.5px] border-green bg-green-tint px-2 text-[0.75rem] text-green-ink" title="{through.label} {through.key}, {through.detail}" data-validated-through>
				<span class="font-semibold">{through.label}</span>
				<a class="font-evo-mono font-bold underline underline-offset-2" href={through.href}>{through.key}</a>
				<span class="text-ink-2">{through.detail}</span>
				{#if through.withdraw}
					<button type="button" class="ml-0.5 grid size-5 place-items-center text-ink-2 hover:text-ink disabled:cursor-default" title="Withdraw this validation" aria-label="Withdraw this validation" {disabled} onclick={through.withdraw}
						><Icon name="undo" size={12} /></button
					>
				{/if}
			</span>
		{/if}
	</span>
{/snippet}

{#if compact}
	{@render strip()}
{:else if icons}
	{@render acts()}
{:else}
<!-- At the end of its row or its card, the group wraps from the right: the pill, its words and its people, never breaks
     (criterion aba60be7). -->
<span class="flex items-center gap-1.5 {end ? 'ml-auto min-w-0 max-w-full flex-[0_1_auto] flex-wrap justify-end gap-y-1' : 'flex-none'}">
	{#if edit}
		<button
			type="button"
			class="grid size-7 place-items-center rounded-lg {edit.on ? ICON_BTN_ON : `${ICON_BTN} text-ink`}"
			aria-pressed={edit.on}
			aria-label={edit.on ? 'Close editing' : edit.blocked ? `Edit this section: ${edit.blocked}` : 'Edit this section'}
			title={edit.on ? 'Close editing' : (edit.blocked ?? 'Edit this section')}
			disabled={disabled || (!edit.on && !!edit.blocked)}
			onclick={edit.toggle}
		>
			<Icon name="pencil" size={16} />
		</button>
	{/if}
	{#if comments}
		<button
			type="button"
			class="flex h-7 items-center gap-1 rounded-lg px-2 font-evo-mono text-[0.8125rem] font-bold transition-colors duration-200 {comments.open
				? ICON_BTN_ON
				: comments.count > 0
					? `${ICON_BTN} text-orange-ink`
					: comments.resolvedOnly
						? `${ICON_BTN} text-green-ink`
						: `${ICON_BTN} text-ink`}"
			aria-label={comments.open ? 'Hide the comments' : 'Comments'}
			title={comments.open ? 'Hide the comments' : 'Comments'}
			aria-expanded={comments.open}
			onclick={toggleComments}
		>
			<Icon name="message-circle" size={16} />
			{#if comments.count > 0}{comments.count}{/if}
		</button>
	{/if}
	{#if sources}
		<button
			type="button"
			class="flex h-7 items-center gap-1 rounded-lg px-2 font-evo-mono text-[0.8125rem] font-bold transition-colors duration-200 {sources.open ? ICON_BTN_ON : `${ICON_BTN} text-ink`}"
			aria-label={sourcesLabel(sources)}
			title={sourcesLabel(sources)}
			aria-expanded={sources.open}
			onclick={sources.toggle}
		>
			<Icon name="book" size={16} />{sources.count}
		</button>
	{/if}
	{@render between?.()}
	{#if validate && view && peopleOnly}
		{@render people()}
	{:else if validate && view}
		<!-- One box per person, no Validate apart from them: the reader validates in their own (criterion 32265cea of
		     feat-34); green behind once everyone it waits on validated. -->
		<span class="relative isolate flex flex-none items-center gap-2 p-1 transition-colors duration-300 {view.state === 'validated' ? 'bg-green-tint' : 'bg-evo-page'}">
			<!-- The green a validation brings in (validate-motion). -->
			<span aria-hidden="true" data-validate-wash class="pointer-events-none absolute inset-0 -z-10 bg-green-tint opacity-0"></span>
			{@render people()}
		</span>
	{/if}
</span>
{/if}
