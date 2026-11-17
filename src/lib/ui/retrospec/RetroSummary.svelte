<script lang="ts">
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import type { Finding } from '$domain/retrospec';
	import { SECONDARY_48, primary48 } from '$ui/evolution/evo-look';
	import FindingList from './FindingList.svelte';
	import HealthChip from './HealthChip.svelte';

	/**
	 * The foot of the summary once the AI is done: what Lyriks noticed, the
	 * points still to review that the Overview counts and Notices lists, with
	 * Project health beside them (criterion 1b4a3935), each point opening its
	 * problem sheet, then the way to the Specification
	 * 360°, where every element is validated, edited or discussed. Who may edit
	 * the project relaunches the analysis beside it, validated or not (criterion
	 * 2dbed801, action e296dd4f).
	 */
	interface Props {
		findings: readonly Finding[];
		/** The specification is already validated: the way reads as opening it. */
		validated: boolean;
		onFinding: (finding: Finding) => void;
		onOpenSpec: () => void;
		/** Project health, the Overview's reading, beside the title; null while it has none (criterion 1b4a3935). */
		health?: {
			readonly score: number;
			readonly verdict: 'strong' | 'watch' | 'critical';
			readonly blocking: number;
			readonly total: number;
			readonly codeLinked?: boolean;
		} | null;
		/** The words of the way on, when it is not to Knowledge. */
		openLabel?: string | null;
		/** Starts the next run; null when none may start (a reader). */
		onRelaunch?: (() => void) | null;
	}
	let { findings, validated, onFinding, onOpenSpec, health = null, openLabel = null, onRelaunch = null }: Props = $props();

	const SHOWN = 8;
</script>

<div class="flex animate-[lk-in_0.35s_ease_both] flex-col gap-4">
	<!-- The design's review list (.ly-review): a sand block, its head ruled off in ink. -->
	<div id="lyriks-noticed" class="box-border flex min-w-0 scroll-mt-24 flex-col gap-3 border border-evo-line bg-surface px-6 py-5">
		<div class="flex flex-col gap-1">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="m-0 text-xl leading-tight font-bold tracking-[-0.02em] text-ink">What Lyriks noticed{findings.length > 0 ? ` · ${findings.length}` : ''}</h2>
				{#if health}<HealthChip {health} />{/if}
			</div>
			{#if findings.length > 0}
				<span class="text-sm leading-normal text-ink-2"
					>Nothing to fix now. Each point stays in Health until someone settles it. Open one to see what you can do with it.</span
				>
			{/if}
		</div>
		{#if findings.length > 0}
			<FindingList {findings} {onFinding} folded={SHOWN} />
		{:else}
			<span class="border-t-[1.5px] border-ink pt-3 text-sm text-ink-3">Nothing to report: no open issue, no gap in what was rebuilt.</span>
		{/if}
	</div>
	<PageFoot class="flex flex-wrap justify-end gap-2.5">
		{#if onRelaunch}
			<button type="button" class={SECONDARY_48} title="Start the next Reverse-Specification: choose next whether it reads what changed or the whole product again" onclick={onRelaunch}>Relaunch the analysis</button>
		{/if}
		<button type="button" class={primary48(true)} onclick={onOpenSpec}>{openLabel ?? (validated ? 'Open Knowledge →' : 'Validate in Knowledge →')}</button>
	</PageFoot>
</div>
