<script lang="ts" module>
	import type { DecisionKind } from '$domain/evolution';

	/** Each step's chip, the design's tag in its hue: the step a decision was taken on. */
	export const DECISION_LOOK: Readonly<Record<DecisionKind, { readonly label: string; readonly look: string }>> = {
		briefing: { label: 'BRIEFING', look: 'border-blue text-blue-ink' },
		solution: { label: 'SOLUTION', look: 'border-ink text-ink' },
		specification: { label: 'SPECIFICATION', look: 'border-violet text-violet-ink' },
		simulation: { label: 'SIMULATION', look: 'border-orange text-orange-ink' },
		verification: { label: 'VERIFICATION', look: 'border-green text-green-ink' },
		closed: { label: 'CLOSED', look: 'border-ink bg-ink text-paper' },
		cancelled: { label: 'CANCELLED', look: 'border-red text-red-ink' }
	};
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { Icon, portalWhile } from '$ui/design-system';
	import { intoFloatDock } from '$ui/shell/app-foot';
	import type { DecisionEntry, DecisionPerson } from '$domain/evolution';
	import { personName } from './people';
	import { relativeWhen } from './relative-when';

	/**
	 * The decision log of a request (the design's): a button floating at the foot
	 * of the page opens a side panel listing every decision taken on it, newest
	 * first, with when, the step, what was decided, why and who. Every entry is
	 * read off the request (decision-log.ts); a step nobody stood behind has none.
	 */
	interface Props {
		/** "<key> · <title>" */
		title: string;
		entries: readonly DecisionEntry[];
		members: readonly { id: string; name: string; jobs?: readonly string[] }[];
		open: boolean;
		onOpen: () => void;
		onClose: () => void;
	}
	let { title, entries, members, open, onOpen, onClose }: Props = $props();

	/** A person by their roster name and what they do on the project, the way the design signs a decision. */
	function signed(p: DecisionPerson): string {
		const jobs = members.find((m) => m.id === p.id)?.jobs ?? [];
		return [personName(p.id, members), ...jobs.slice(0, 1)].join(' · ');
	}

	let closer = $state<HTMLButtonElement | null>(null);
	$effect(() => {
		if (open) void tick().then(() => closer?.focus());
	});
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && onClose()} />

{#if !open}
	<!-- Beside the AI's chip at the bottom left, never under it (ac-ai-session-band). -->
	<button
		type="button"
		class="pressable inline-flex min-h-10 flex-none items-center gap-2 border-[1.5px] border-ink bg-paper px-3.5 font-evo text-[0.8125rem] font-semibold whitespace-nowrap text-ink"
		aria-haspopup="dialog"
		onclick={onOpen}
		{@attach intoFloatDock}
	>
		<Icon name="clock" size={15} />
		Decision log · {entries.length}
	</button>
{:else}
	<div class="animate-lk-fade fixed inset-0 z-[55] flex justify-end bg-ink/35" use:portalWhile={true}>
		<button type="button" class="min-w-0 flex-auto cursor-pointer" aria-label="Close" tabindex="-1" onclick={onClose}></button>
		<div role="dialog" aria-modal="true" aria-label="Decision log" class="box-border flex h-full w-[460px] max-w-full flex-col gap-4 overflow-y-auto bg-paper p-6 font-evo text-ink shadow-[inset_2px_0_0_var(--color-ink)]">
			<div class="flex items-start justify-between gap-3">
				<span class="flex flex-col gap-1">
					<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3">DECISION LOG</span>
					<h3 class="m-0 text-xl leading-[1.2] font-bold tracking-[-0.02em]">{title}</h3>
					<span class="text-[0.8125rem] text-ink-2">Every decision, who took it and why. Nothing is lost between two meetings.</span>
				</span>
				<button bind:this={closer} type="button" class="flex size-9 flex-none items-center justify-center rounded-lg border-[1.5px] border-line font-evo-mono text-lg text-ink hover:border-ink" aria-label="Close" onclick={onClose}>×</button>
			</div>
			{#if entries.length === 0}
				<p class="m-0 text-[0.8125rem] leading-[1.4] text-ink-3 italic">No decision yet. Each validation, each choice on an impact and the closing land here, with who took it and why.</p>
			{:else}
				<ol class="m-0 flex list-none flex-col p-0">
					{#each entries as entry (entry.id)}
						<li class="flex gap-3 border-b border-line py-3">
							<time class="w-16 flex-none font-evo-mono text-xs text-ink-3" datetime={entry.at} title={new Date(entry.at).toLocaleString()}>{relativeWhen(entry.at)}</time>
							<span class="flex min-w-0 flex-auto flex-col gap-1">
								<span class="self-start border-[1.5px] px-2 py-0.5 font-evo-mono text-[0.625rem] font-bold tracking-[0.06em] uppercase {DECISION_LOOK[entry.kind].look}">{DECISION_LOOK[entry.kind].label}</span>
								<span class="text-[0.9375rem] leading-snug font-bold wrap-anywhere">{entry.what}</span>
								{#if entry.why}<span class="text-[0.8125rem] leading-normal text-ink-2 wrap-anywhere">{entry.why}</span>{/if}
								<span class="flex flex-wrap items-center gap-x-2 font-evo-mono text-xs text-ink-3">
									{#each entry.who as person (person.id)}
										<span class="inline-flex items-center gap-1">
											{signed(person)}
											{#if person.throughAi}<span title="Through their AI client" aria-label="Through their AI client" class="text-violet-ink"><Icon name="sparkles" size={11} /></span>{/if}
										</span>
									{/each}
								</span>
							</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</div>
{/if}
