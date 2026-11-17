<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Finding } from '$domain/retrospec';
	import SideSheet from './SideSheet.svelte';
	import RereadCode from '$ui/ai-session/RereadCode.svelte';

	/**
	 * The problem sheet of one finding, opened beside the analysis: what it is in
	 * short, where it applies, where it comes from. A side panel over the page;
	 * Escape, the backdrop or "Back to the analysis" close it. Its foot offers to
	 * have the reader's AI re-read the code it is about (ac-ai-session-reread).
	 * `decide`, first under the title, is where the page lets a person answer it
	 * (criterion e0f69b3c).
	 */
	let {
		finding,
		onClose,
		closeLabel = 'Back to the analysis',
		decide
	}: { finding: Finding; onClose: () => void; closeLabel?: string; decide?: Snippet } = $props();
</script>

<SideSheet kicker={finding.sheet.kicker} kickerClass="text-red-ink" title={finding.sheet.title} {closeLabel} backdropLabel="Close record" {onClose}>
	{@render decide?.()}
	{#each finding.sheet.sections as section (section.heading)}
		<div class="flex flex-col gap-2">
			<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">{section.heading}</span>
			{#if section.text}<p class="m-0 leading-[1.6] text-ink-2">{section.text}</p>{/if}
			{#if section.list}
				<div class="flex flex-col gap-1.5">
					{#each section.list as row, i (i)}
						<div class="flex flex-wrap items-baseline gap-2.5 bg-surface-sunken px-3 py-2">
							<span class="flex-none font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">{row.k}</span>
							<span class="text-sm font-semibold text-ink">{row.v}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
	<RereadCode page="retrospec" anchor={finding.id} title={finding.sheet.title || finding.text} text={finding.text} />
</SideSheet>
