<script lang="ts">
	import type { Finding } from '$domain/retrospec';
	import { Icon } from '$ui/design-system';
	import EarsText from '$ui/glossary/EarsText.svelte';

	/**
	 * What Lyriks noticed on the Reverse page, in two groups a person tells
	 * apart at a glance: what the final check could not confirm, first and
	 * tinted, then the other points (criterion 1b4a3935). Each row opens its
	 * problem sheet.
	 * A point reads as its EARS statement when one is known, its keywords
	 * standing out, the description behind it on hover; otherwise as its title
	 * (criterion ad34b2f4).
	 */
	interface Props {
		findings: readonly Finding[];
		onFinding: (finding: Finding) => void;
		/** Rows of the second group shown before "Show more"; all when absent. */
		folded?: number;
	}
	let { findings, onFinding, folded }: Props = $props();

	const unconfirmed = $derived(findings.filter((f) => f.unconfirmed));
	const read = $derived(findings.filter((f) => !f.unconfirmed));
	let all = $state(false);
	const shown = $derived(folded === undefined || all ? read : read.slice(0, folded));
	// A row reads as something to open: the hand, a tint under the pointer, and the chevron that leads to its sheet.
	// The design's review point (.ly-point): a square severity mark, the point, its tag; rows ruled by the line colour.
	const ROW = 'group -mx-2 flex min-h-12 cursor-pointer flex-wrap items-center gap-3 px-2 py-1 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken';
	/** Under its group's heading, an unconfirmed point drops the "Not confirmed:" its sheet keeps. */
	const label = (f: Finding) => {
		if (!f.unconfirmed) return f.text;
		const bare = f.text.replace(/^Not confirmed: /, '');
		return bare.charAt(0).toUpperCase() + bare.slice(1);
	};
</script>

{#snippet row(finding: Finding, first: boolean)}
	<button type="button" class="{ROW} {first ? '' : 'border-t border-line'}" title={finding.hint} onclick={() => onFinding(finding)}>
		<span class="size-2.5 flex-none {finding.unconfirmed ? 'bg-orange' : finding.tone === 'major' ? 'bg-red' : 'bg-orange'}"></span>
		<span class="flex-[1_1_260px] text-[0.9375rem] font-semibold text-ink">{#if finding.ears}<EarsText text={finding.ears} />{:else}{label(finding)}{/if}</span>
		{#if finding.unconfirmed && finding.ears && finding.reach}
			<span class="border-[1.5px] border-orange px-2 py-[3px] font-evo-mono text-xs font-bold tracking-[0.06em] text-orange-ink uppercase">{finding.reach}</span>
		{:else if !finding.unconfirmed}
			<span class="border-[1.5px] border-ink px-2 py-[3px] font-evo-mono text-xs font-bold tracking-[0.06em] text-ink uppercase">{finding.where}</span>
		{/if}
		<span class="flex-none text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
	</button>
{/snippet}

<div class="flex flex-col gap-4">
	{#if unconfirmed.length > 0}
		<div id="lyriks-unconfirmed" class="flex scroll-mt-24 flex-col gap-1 border-l-[6px] border-orange bg-orange-tint px-4 pt-3 pb-1">
			<span class="text-base font-bold text-ink">Could not be confirmed · {unconfirmed.length}</span>
			<span class="text-[0.8125rem] leading-normal text-ink-2"
				>The final check could not confirm these points. They block the project health until someone settles them; nothing to do now.</span
			>
			<div class="mt-1 flex flex-col">
				{#each unconfirmed as finding, i (finding.id)}{@render row(finding, i === 0)}{/each}
			</div>
		</div>
	{/if}
	{#if read.length > 0}
		<div class="flex flex-col gap-1">
			{#if unconfirmed.length > 0}<span class="text-base font-bold text-ink">Other points · {read.length}</span>{/if}
			<div class="flex flex-col">
				{#each shown as finding, i (finding.id)}{@render row(finding, i === 0)}{/each}
			</div>
			{#if folded !== undefined && read.length > folded}
				<button type="button" class="self-start pt-1 text-sm font-semibold text-blue-ink" onclick={() => (all = !all)}>{all ? 'Show fewer' : `Show ${read.length - folded} more`}</button>
			{/if}
		</div>
	{/if}
</div>
