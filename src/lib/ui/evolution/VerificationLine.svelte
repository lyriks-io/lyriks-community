<script lang="ts">
	import CodePlace from '$ui/spec360/CodePlace.svelte';
	import { OPINIONS, TONE_TEXT, codePlaceOf, requirementParts, whereOf, type Choice, type LineReading, type ReportLineLike } from './report-board';
	import { TEXTAREA } from './evo-look';

	/**
	 * One line of the report, the design's card: its badge, what the spec asks,
	 * where it stands; open, what the spec expects beside what the code shows,
	 * what is proposed to the LLM and whether it goes in the fix, and the
	 * opinion a person gives on it.
	 */
	interface Props {
		projectId: string;
		line: ReportLineLike;
		label: string;
		reading: LineReading;
		/** The evolution started from this deferred omission, when there is one (criterion 03b7eacf). */
		carriedBy?: { readonly id: string; readonly key: string | null };
		/** The id the page opens on (a place of the request). */
		domId: string;
		open: boolean;
		editable: boolean;
		marked: boolean;
		suggestion: string;
		onToggle: () => void;
		onPick: (choice: Choice) => void;
		onToggleIncluded: () => void;
		onSuggest: (text: string) => void;
	}
	let { projectId, line, label, reading, carriedBy, domId, open, editable, marked, suggestion, onToggle, onPick, onToggleIncluded, onSuggest }: Props = $props();

	const parts = $derived(requirementParts(line.requirement));
	const category = $derived(reading.category);
	const issue = $derived(category.key === 'gap' || category.key === 'omission' || category.key === 'regression');
	const where = $derived(whereOf(line));
	const code = $derived(codePlaceOf(line));
	/** Green once a person or the code settled it, the colour of its category otherwise. */
	const border = $derived(reading.tone === 'ok' && category.key !== 'compliant' ? 'border-green' : category.border);
	const showFix = $derived(issue && (reading.choice === 'agree' || reading.choice === 'investigate' || (reading.choice === 'manual' && suggestion.trim() !== '')));
	/** What the code shows, in the colour of what it means: the design's spec versus code (.ly-compare). */
	const observed = $derived(
		category.key === 'compliant'
			? { box: 'border-green-ink bg-green-tint', label: 'text-green-ink' }
			: category.key === 'addition'
				? { box: 'border-ink-3 bg-toner-2', label: 'text-ink-3' }
				: { box: 'border-red-ink bg-red-tint', label: 'text-red-ink' }
	);
	// A tinted box, a 1.5px border in the colour's ink and a 6px edge on its left.
	const PRE = 'm-0 rounded-lg border-[1.5px] border-l-[6px] px-4 py-3.5 font-evo-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap wrap-anywhere text-evo-ink';
</script>

<div id={domId} class="scroll-mt-[140px] overflow-hidden rounded-evo-card border bg-toner-1 transition-shadow {border} {marked ? 'ring-2 ring-blue ring-offset-2' : ''}">
	<button type="button" class="flex min-h-15 w-full flex-wrap items-center gap-4 px-5 py-3.5 text-left text-evo-ink" aria-expanded={open} onclick={onToggle}>
		<span class="border-[1.5px] px-2.5 py-1 font-evo-mono text-xs font-bold tracking-[0.06em] {category.pill}">{label} · {category.badge}</span>
		<span class="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
			<span class="text-base font-bold">{parts.title}</span>
			<span class="font-evo-mono text-xs text-ink-3">{parts.path ? `${label} · ${parts.path}` : label}</span>
		</span>
		{#if reading.deferred}
			<span class="border-[1.5px] border-blue px-2.5 py-1 font-evo-mono text-xs font-bold tracking-[0.06em] text-blue-ink">{carriedBy ? `Carried by ${carriedBy.key}` : reading.tag}</span>
		{:else}
			<span class="font-evo-mono text-xs font-bold {TONE_TEXT[reading.tone]}">{reading.tag}</span>
		{/if}
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="flex-none text-ink transition-transform duration-200 {open ? 'rotate-180' : ''}"><path d="M6 9l6 6 6-6" /></svg
		>
	</button>
	{#if open}
		<div class="animate-lk-in-fast flex flex-col gap-5 border-t border-line p-6">
			<div class="flex flex-wrap gap-4">
				<div class="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
					<span class="font-evo-mono text-xs tracking-[0.08em] text-green-ink">EXPECTED · SPEC</span>
					<pre class="{PRE} border-green-ink bg-green-tint">{line.specStatement || line.requirement}</pre>
				</div>
				<div class="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
					<span class="font-evo-mono text-xs tracking-[0.08em] {observed.label}">OBSERVED · CODE {#if code}<CodePlace {projectId} featureId={code.featureId} place={code.place} file={code.file} line={code.line} recorded={code.recorded} kind={label} name={parts.title} class="font-normal tracking-normal text-ink-3" />{:else if where}<span class="font-normal tracking-normal text-ink-3">{where}</span>{/if}</span>
					<pre class="{PRE} {observed.box}">{line.codeStatement || 'Nothing found in the code.'}</pre>
				</div>
			</div>
			{#if showFix}
				<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper px-3.5 py-3">
					<span class="flex-[1_1_320px] text-sm"><b>{reading.fixLabel}</b> {reading.said}</span>
					<button
						type="button"
						class="min-h-11 rounded-lg border-[1.5px] px-3.5 text-xs font-bold tracking-[0.07em] uppercase {reading.inFix ? 'border-ink bg-ink text-paper' : 'border-ink bg-transparent text-ink'}"
						aria-pressed={reading.inFix}
						onclick={onToggleIncluded}>{reading.inFix ? '☑ Included in the fix' : '☐ Not included'}</button
					>
				</div>
			{/if}
			{#if reading.deferred}
				<p class="m-0 text-sm text-ink-2">
					{#if carriedBy}
						This omission is carried by <a class="font-bold text-blue-ink" href="/projects/{projectId}/evolution?request={encodeURIComponent(carriedBy.id)}">{carriedBy.key}</a>.
					{:else}
						Listed as a suggestion in <a class="font-bold text-blue-ink" href="/projects/{projectId}/evolution">Changes</a>, until you change your choice or start it.
					{/if}
				</p>
			{/if}
			{#if editable}
				<div class="flex flex-wrap items-center gap-2">
					<span class="mr-1 font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Your opinion:</span>
					{#each OPINIONS[category.key] as o (o.choice)}
						{@const on = reading.choice === o.choice}
						<button
							type="button"
							class="min-h-10 border-[1.5px] px-3.5 text-[0.8125rem] font-medium {on ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-ink'}"
							aria-pressed={on}
							onclick={() => onPick(o.choice)}>{o.label}</button
						>
					{/each}
				</div>
			{/if}
			{#if editable && reading.choice === 'manual'}
				<div class="animate-lk-in-fast flex flex-col gap-2">
					<label for="{domId}-suggestion" class="text-sm font-semibold">What should be implemented?</label>
					<textarea
						id="{domId}-suggestion"
						rows="3"
						aria-label="Your suggestion"
						value={suggestion}
						placeholder="Describe what to implement and where"
						class="{TEXTAREA} text-sm"
						oninput={(e) => onSuggest(e.currentTarget.value)}
					></textarea>
				</div>
			{/if}
			{#if editable && (reading.specChange || (reading.choice === 'keep' && reading.tone === 'spec'))}
				<!-- What changing the spec instead of the code touches: the place of the line in the specification. -->
				<div class="animate-lk-in flex flex-col gap-2.5 rounded-evo-btn border border-transparent bg-orange-tint px-[18px] py-4 shadow-[inset_6px_0_0_var(--color-orange)]">
					<span class="text-[0.9375rem] font-bold text-ink">Impact on the evolution specification</span>
					<div class="flex flex-wrap gap-2">
						<span class="rounded-md border border-orange bg-paper px-2.5 py-1 font-evo-mono text-xs">{parts.path || parts.title}</span>
					</div>
					<span class="text-sm text-ink-2">
						{reading.choice === 'keep'
							? 'Keeping this addition writes it into the spec when the evolution is closed.'
							: 'Changing the spec reopens it: the technical spec and the approval go back to validation.'}
					</span>
				</div>
			{/if}
		</div>
	{/if}
</div>
