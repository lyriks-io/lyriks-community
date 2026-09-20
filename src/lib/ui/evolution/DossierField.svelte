<script lang="ts">
	import { Icon } from '$ui/design-system';
	import SignatureStrip from './SignatureStrip.svelte';
	import type { BlockField, Guarded } from '$domain/evolution';

	/**
	 * One editable field of the dossier.
	 *
	 * It shows a value that belongs to another section and writes straight into
	 * that section, keeping no copy of its own. Everything here follows from that:
	 * the value is saved when the field loses focus (so leaving the page never
	 * loses an edit), a refusal is reported ON the field rather than in a banner
	 * far from it, and a refused write leaves the field exactly as the owning
	 * section holds it rather than half written.
	 *
	 * Prose gets the room it needs. A problem statement or an objective rarely
	 * fits on one line, and a control that implies it does produces specs written
	 * to fit the box.
	 *
	 * A field the author cannot answer yet is an open question: amber, counted as
	 * empty, never a fault. Typing a value answers it; so does taking the mark
	 * back by hand.
	 */
	interface Props {
		field: BlockField;
		/** The feature this value belongs to. */
		leafId: string;
		leafName: string;
		/** Name the feature only when the request touches more than one. */
		showLeafName: boolean;
		/** Where it lands, shown so the reader knows the dossier owns nothing. */
		canonicalPath: string;
		value: string;
		sourceIds: readonly string[];
		/** The project evidence register, for the citations this value rests on. */
		sources: readonly { id: string; title: string; url: string; note: string }[];
		canEdit: boolean;
		/** True while the author has marked this home as a question they cannot answer yet. */
		openQuestion: boolean;
		/** Mark the home as an open question, or take the mark back. */
		onToggleOpenQuestion: () => void;
		/** Who stands behind the value shown, oldest first. */
		signatures: readonly { signerId: string; signedAt: string }[];
		signedByMe: boolean;
		canSign: Guarded;
		onSign: () => void;
		onWithdraw: () => void;
		/** The state of the latest thread on this home, if any, and how many messages it holds. */
		thread: { state: string; messages: number } | null;
		onOpenThread: () => void;
		/** Save on blur. Resolves with the refusal when the section refuses. */
		onSave: (value: string, sourceIds: string[]) => Promise<{ reason: string } | null>;
		onOpenCanonical: () => void;
		/** Opens Documents and Sources, where a citation can be read whole. */
		onOpenRegister: () => void;
	}
	let {
		field,
		leafId,
		leafName,
		showLeafName,
		canonicalPath,
		value,
		sourceIds,
		sources,
		canEdit,
		openQuestion,
		onToggleOpenQuestion,
		signatures,
		signedByMe,
		canSign,
		onSign,
		onWithdraw,
		thread,
		onOpenThread,
		onSave,
		onOpenCanonical,
		onOpenRegister
	}: Props = $props();

	// Both start empty and are filled by the effects below, which is also what
	// re-syncs them when the owning section changes under us.
	let draft = $state('');
	let cited = $state<string[]>([]);
	let status = $state<'idle' | 'writing' | 'accepted' | 'refused'>('idle');
	let refusal = $state('');
	let pickingSource = $state(false);

	// A change made in the owning capability shows on the next read: the field
	// follows its section rather than its own stale copy.
	$effect(() => {
		if (status === 'idle') draft = value;
	});
	$effect(() => {
		cited = [...sourceIds];
	});

	async function save() {
		if (!canEdit) return;
		if (draft === value && sameSources()) return;
		status = 'writing';
		const failure = await onSave(draft, cited);
		if (failure) {
			// Nothing was written, so the field goes back to what the section holds.
			refusal = failure.reason;
			status = 'refused';
			draft = value;
			return;
		}
		refusal = '';
		status = 'accepted';
		setTimeout(() => {
			if (status === 'accepted') status = 'idle';
		}, 1200);
	}

	const sameSources = () =>
		cited.length === sourceIds.length && cited.every((id) => sourceIds.includes(id));

	function toggleSource(id: string) {
		cited = cited.includes(id) ? cited.filter((s) => s !== id) : [...cited, id];
		void save();
	}

	const sourceOf = (id: string) => sources.find((s) => s.id === id);
	const titleOf = (id: string) => sourceOf(id)?.title ?? id;
	/** A link when the row points at one, otherwise the register itself. */
	const isLink = (id: string) => /^https?:\/\//i.test(sourceOf(id)?.url ?? '');
	const isList = $derived(field.kind === 'list');
	const rows = $derived(isList ? 4 : field.multiline ? 3 : 2);
</script>

<div
	class="group rounded-field border p-2.5 {status === 'refused'
		? 'border-danger-300'
		: openQuestion
			? 'border-warning-300 bg-warning-50/40'
			: signatures.length > 0
				? 'border-success-200'
				: 'border-line'}"
>
	<!-- Quiet by default. The acts sit at the right and show on hover or focus;
	     only a state that carries information stays visible. -->
	<div class="mb-1 flex items-center gap-2">
		{#if showLeafName}
			<span class="text-[11px] font-semibold text-ink-700">{leafName}</span>
		{/if}
		{#if openQuestion}
			<span
				class="inline-flex items-center gap-1 text-[10px] font-semibold text-warning-700"
				title="A declared unknown, not an oversight. It counts as empty and lowers nothing else."
			>
				<Icon name="circle-question-mark" size={10} /> open question
			</span>
		{/if}
		{#if status === 'writing'}
			<span class="text-[10px] text-ink-400">saving…</span>
		{:else if status === 'accepted'}
			<span class="inline-flex items-center gap-0.5 text-[10px] text-success-600">
				<Icon name="check" size={10} /> written
			</span>
		{/if}
		<div class="ml-auto flex items-center gap-0.5">
			{#if thread && thread.messages > 0}
				<button
					type="button"
					onclick={onOpenThread}
					class="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] {thread.state === 'open'
						? 'text-warning-700'
						: 'text-ink-400'} hover:bg-surface-sunken"
					title="{thread.messages} {thread.messages === 1 ? 'message' : 'messages'}, {thread.state.replace(
						/_/g,
						' '
					)}"
				>
					<Icon name="message-circle" size={11} />
					{thread.messages}
				</button>
			{/if}
			<!-- Always there, never loud: icons, no text, amber only when it means something. -->
			<span class="flex items-center gap-0.5">
				{#if !(thread && thread.messages > 0)}
					<button
						type="button"
						onclick={onOpenThread}
						aria-label="Discuss this value"
						title="Discuss this value where it stands"
						class="rounded p-1 text-ink-300 hover:bg-surface-sunken hover:text-brand-600"
					>
						<Icon name="message-circle" size={12} />
					</button>
				{/if}
				{#if canEdit}
					<button
						type="button"
						onclick={onToggleOpenQuestion}
						aria-label={openQuestion ? 'Not an open question any more' : 'Mark as an open question'}
						title={openQuestion
							? 'Take the mark back without writing a value'
							: 'Cannot answer this yet? Say so: it turns amber and lowers nothing on the other fields.'}
						class="rounded p-1 {openQuestion
							? 'text-warning-700 hover:bg-warning-100'
							: 'text-ink-300 hover:bg-surface-sunken hover:text-warning-700'}"
					>
						<Icon name="circle-question-mark" size={12} />
					</button>
				{/if}
				<button
					type="button"
					onclick={onOpenCanonical}
					aria-label="Open it where it lives"
					class="rounded p-1 text-ink-300 hover:bg-surface-sunken hover:text-brand-600"
					title="Open it where it lives: {canonicalPath}"
				>
					<Icon name="arrow-up-right" size={12} />
				</button>
			</span>
		</div>
	</div>

	{#if isList}
		<textarea
			bind:value={draft}
			onblur={save}
			disabled={!canEdit}
			{rows}
			placeholder={field.example}
			class="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-400 disabled:opacity-60"
		></textarea>
	{:else}
		<!-- Prose gets room: a spec written to fit a one-line box reads like one. -->
		<textarea
			bind:value={draft}
			onblur={save}
			disabled={!canEdit}
			{rows}
			placeholder={field.example}
			class="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-400 disabled:opacity-60"
		></textarea>
	{/if}

	{#if status === 'refused'}
		<!-- The owning section refused, and it says so here rather than in a banner. -->
		<p class="mt-1 flex items-start gap-1 text-[11px] text-danger-600">
			<Icon name="circle-alert" size={11} class="mt-0.5 shrink-0" />
			{refusal}
		</p>
	{/if}

	<!-- What this value rests on. A claim nobody can trace back is a claim. -->
	<div class="mt-1.5 flex flex-wrap items-center gap-1">
		<span class="text-[9px] font-semibold uppercase tracking-wide text-ink-400">Sources</span>
		{#each cited as id (id)}
			{@const source = sourceOf(id)}
			<span
				class="inline-flex items-center gap-1 rounded-pill bg-info-50 px-1.5 py-0.5 text-[10px] text-info-700"
			>
				<!-- A citation nobody can open is a citation nobody can check. -->
				{#if isLink(id)}
					<a
						href={source?.url}
						target="_blank"
						rel="noreferrer"
						title={source?.note || source?.url}
						class="inline-flex items-center gap-0.5 underline decoration-info-300 underline-offset-2 hover:text-info-900"
					>
						{titleOf(id)}<Icon name="arrow-up-right" size={9} />
					</a>
				{:else}
					<button
						type="button"
						onclick={onOpenRegister}
						title={source?.note
							? `${source.note}\n\nOpen Documents and Sources`
							: 'Open Documents and Sources'}
						class="underline decoration-info-300 underline-offset-2 hover:text-info-900"
					>
						{titleOf(id)}
					</button>
				{/if}
				{#if canEdit}
					<button
						type="button"
						onclick={() => toggleSource(id)}
						aria-label="Remove this citation"
						class="text-info-600 hover:text-danger-500"
					>
						<Icon name="x" size={9} />
					</button>
				{/if}
			</span>
		{:else}
			<span class="text-[10px] italic text-ink-300">none cited</span>
		{/each}
		{#if canEdit && sources.length > 0}
			<button
				type="button"
				onclick={() => (pickingSource = !pickingSource)}
				class="rounded-pill border border-line px-1.5 py-0.5 text-[10px] text-ink-500 hover:border-brand-300 hover:text-brand-600"
			>
				<Icon name="plus" size={9} /> cite
			</button>
		{/if}
	</div>

	{#if pickingSource}
		<div class="mt-1.5 flex flex-wrap gap-1 rounded-field border border-line bg-surface-sunken/50 p-2">
			{#each sources.filter((s) => !cited.includes(s.id)) as source (source.id)}
				<button
					type="button"
					onclick={() => {
						toggleSource(source.id);
						pickingSource = false;
					}}
					class="rounded-pill border border-line bg-surface px-2 py-0.5 text-[10px] text-ink-600 hover:border-brand-300 hover:text-brand-600"
				>
					{source.title || 'Untitled source'}
				</button>
			{:else}
				<span class="text-[10px] text-ink-400">
					Every source is already cited. Add more in Documents and Sources.
				</span>
			{/each}
		</div>
	{/if}

	<!-- Who stands behind this value. Settled, never locked: the field above stays live. -->
	<SignatureStrip {signatures} {signedByMe} {canSign} {onSign} {onWithdraw} />
</div>
