<script lang="ts">
	/**
	 * Where the reader stands in what one user can reach (criterion 1ca9b3b4):
	 * PROFILE, then CORE FEATURE, then FEATURE, each a small two-line chip that
	 * leads back to its level, the current one in ink (the design's trail, .ly-trail).
	 */
	interface Props {
		steps: readonly { readonly level: string; readonly name: string; readonly href: string; readonly current: boolean }[];
	}
	let { steps }: Props = $props();
</script>

<nav aria-label="Access path" class="mt-[22px] flex flex-wrap items-center gap-1.5">
	{#each steps as step, i (step.level)}
		{#if i > 0}<span aria-hidden="true" class="font-evo-mono text-ink-3">›</span>{/if}
		<a
			href={step.href}
			aria-current={step.current ? 'page' : undefined}
			class="inline-flex min-h-11 max-w-full flex-col items-start justify-center border px-3 py-1.5 text-left text-[0.8125rem] font-semibold no-underline transition-colors duration-150 {step.current
				? 'border-ink bg-ink text-paper hover:text-paper'
				: 'border-toner bg-surface text-ink hover:border-ink hover:text-ink'}"
		>
			<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] uppercase {step.current ? 'text-ink-4' : 'text-ink-3'}">{step.level}</span>
			<span class="max-w-full truncate">{step.name}</span>
		</a>
	{/each}
</nav>
