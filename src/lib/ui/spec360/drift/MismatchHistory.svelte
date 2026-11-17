<script lang="ts">
	import type { HistoryLine } from '$domain/retrospec';
	import { BTN } from '$ui/spec360/page/look';

	/**
	 * What was done on Mismatch and by the runs it reports (criterion 64d191d6),
	 * newest first. The server sends it to administrators alone. The time is
	 * written in UTC, the same for everyone who compares two lines.
	 */
	interface Props {
		lines: readonly HistoryLine[];
	}
	let { lines }: Props = $props();

	const FIRST = 25;
	let all = $state(false);
	const shown = $derived(all ? lines : lines.slice(0, FIRST));
	const stamp = (at: string) => `${at.slice(0, 10)} ${at.slice(11, 16)} UTC`;
</script>

<section class="mt-9" aria-labelledby="action-history" data-action-history>
	<h2 id="action-history" class="m-0 text-xl font-bold tracking-[-0.02em] text-ink">History</h2>
	<p class="m-0 mt-1 text-sm text-ink-2">Every action taken on Mismatch and by the runs it reports. Only administrators see it.</p>
	{#if lines.length === 0}
		<p class="m-0 mt-3 text-sm text-ink-3">No action recorded yet.</p>
	{:else}
		<ol class="m-0 mt-3 list-none p-0">
			{#each shown as line, i (i)}
				<li class="grid grid-cols-[176px_minmax(0,1fr)] gap-x-3 border-t border-evo-line py-2.5 max-[700px]:grid-cols-[minmax(0,1fr)]" data-history-line>
					<time class="font-evo-mono text-xs leading-5 text-ink-3" datetime={line.at}>{stamp(line.at)}</time>
					<div class="min-w-0">
						<p class="m-0 text-sm leading-5 text-ink [overflow-wrap:anywhere]">
							<b>{line.who}</b>
							{line.what}{#if line.through}<span class="ml-2 font-evo-mono text-xs text-ink-3">through {line.through}&rsquo;s AI</span>{/if}
						</p>
						{#if line.note}<p class="m-0 mt-1 text-sm leading-normal text-ink-2 [overflow-wrap:anywhere]">{line.note}</p>{/if}
					</div>
				</li>
			{/each}
		</ol>
		{#if !all && lines.length > FIRST}
			<button type="button" class="{BTN} mt-3" onclick={() => (all = true)}>Show all {lines.length}</button>
		{/if}
	{/if}
</section>
