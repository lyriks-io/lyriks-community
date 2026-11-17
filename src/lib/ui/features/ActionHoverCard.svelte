<script lang="ts">
	/**
	 * The card an action's code icon opens on hover in the feature tree, laid out like
	 * the maturity card (spec: criterion d42a090d): what the action is for, where
	 * it happens, its rules by kind, its share of code located with each element
	 * and where the code carries it, and what a click does. Shown when the host's
	 * `group/action` is hovered, floating under <body> so no box cuts it
	 * (criterion 5651ca29).
	 */
	import type { KernelRule } from '$application/specification/index-feature-rules';
	import type { ImplementationElement } from '$application/analysis/load-implementation-coverage';
	import { readableName } from '$domain/features';
	import { floatInView, hoverWithin } from '$ui/design-system';

	interface CoverageLike {
		found: number;
		expected: number;
		percent: number;
		elements?: readonly ImplementationElement[];
	}

	interface Props {
		name: string;
		intent: string;
		surfaceName: string;
		rules: readonly KernelRule[];
		coverage?: CoverageLike | null;
		/** Whether a click on the name opens the action's details. */
		opensDetails: boolean;
	}
	let { name, intent, surfaceName, rules, coverage = null, opensDetails }: Props = $props();

	const blocks = $derived(rules.filter((r) => r.kind === 'rule' && r.effect === 'block').length);
	const allows = $derived(rules.filter((r) => r.kind === 'rule' && r.effect !== 'block').length);
	const holds = $derived(rules.filter((r) => r.kind === 'invariant').length);
	const percent = $derived(coverage?.percent ?? 0);
	const tone = $derived(
		percent >= 75 ? 'text-success-600' : percent >= 40 ? 'text-warning-600' : 'text-danger-500'
	);

	/** Past this many lines the card counts the rest, so it never outgrows the screen. */
	const ELEMENT_CAP = 8;
	const elements = $derived(coverage?.elements ?? []);
	// The word "surface" never reaches the screen: its rules read as the screen's.
	const KIND_WORD: Record<string, string> = {
		action: 'Action',
		rule: 'Rule',
		invariant: 'Invariant',
		transition: 'Transition',
		event: 'Event',
		state: 'State',
		data: 'Data',
		surface_rule: 'Screen rule',
		surface_invariant: 'Screen invariant'
	};
	const nameOf = (element: ImplementationElement) =>
		element.kind === 'action' ? readableName(element.name) : element.name;
	const whereOf = (location: NonNullable<ImplementationElement['location']>) => {
		const file = location.file.split('/').pop() ?? '';
		if (!file) return 'Located';
		return location.line != null ? `${file}:${location.line}` : file;
	};
	let shown = $state(false);
	let anchor = $state<HTMLElement | null>(null);
</script>

<span hidden use:hoverWithin={{ selector: '.group\\/action', onChange: (on, at) => ((shown = on), (anchor = at)) }}></span>
{#if shown}
<div
	use:floatInView={{ anchor, align: 'right' }}
	role="tooltip"
	class="pointer-events-none w-80 rounded-card border border-line bg-surface p-3 text-left text-[0.71875rem] font-normal leading-snug text-ink-700 shadow-xl"
>
	<div class="flex items-baseline justify-between gap-3">
		<p class="text-[0.59375rem] font-bold uppercase tracking-widest text-ink-400">Action</p>
		<p class="font-mono text-[0.9375rem] font-semibold tabular-nums {tone}" title="Code located">
			&lt;/&gt; {percent}%
		</p>
	</div>
	<p class="mt-1 text-[0.78125rem] font-semibold text-ink-900">{name}</p>
	{#if intent}
		<p class="mt-0.5 text-ink-500">{intent}</p>
	{/if}

	<p class="mt-2 font-semibold text-ink-800">Happens in</p>
	<p class="text-ink-500">{surfaceName}</p>

	<p class="mt-2 font-semibold text-ink-800">Rules</p>
	{#if rules.length === 0}
		<p class="text-ink-500">No rule yet.</p>
	{:else}
		<div class="mt-0.5 grid grid-cols-3 gap-1.5 text-center">
			{#each [{ label: 'Blocks', value: blocks }, { label: 'Allows', value: allows }, { label: 'Always holds', value: holds }] as stat (stat.label)}
				<div class="rounded-field bg-surface-sunken px-1.5 py-1">
					<p class="font-mono text-[0.8125rem] font-semibold tabular-nums text-ink-900">{stat.value}</p>
					<p class="text-[0.625rem] text-ink-500">{stat.label}</p>
				</div>
			{/each}
		</div>
	{/if}

	<p class="mt-2 font-semibold text-ink-800">Code</p>
	<p class="text-ink-500">
		{#if coverage && coverage.expected > 0}
			{coverage.found} of {coverage.expected} spec elements located in code, per the last code-adoption sync.
		{:else}
			Nothing of this action is mapped to code yet (0%).
		{/if}
	</p>
	{#if elements.length > 0}
		<ul class="mt-1.5 space-y-1">
			{#each elements.slice(0, ELEMENT_CAP) as element, i (i)}
				<li class="leading-tight">
					<p class="truncate">
						<span class="text-[0.59375rem] font-semibold uppercase tracking-wide text-ink-400"
							>{KIND_WORD[element.kind] ?? element.kind}</span
						>
						<span class="text-ink-800">{nameOf(element)}</span>
					</p>
					{#if element.location}
						<p class="truncate font-mono text-[0.65625rem] text-ink-500">{whereOf(element.location)}</p>
					{:else}
						<p class="text-[0.65625rem] font-medium text-warning-600">Not located</p>
					{/if}
				</li>
			{/each}
		</ul>
		{#if elements.length > ELEMENT_CAP}
			<p class="mt-1 text-[0.65625rem] text-ink-400">and {elements.length - ELEMENT_CAP} more</p>
		{/if}
	{/if}

	{#if opensDetails}
		<p class="mt-2 border-t border-line pt-2 text-[0.65625rem] text-ink-400">
			Click its name to open its details.
		</p>
	{/if}
</div>
{/if}
