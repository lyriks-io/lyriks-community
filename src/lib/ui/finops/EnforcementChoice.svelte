<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';
	import { ENFORCEMENT_MODES, type EnforcementMode } from '$domain/finops';
	import type { FinopsStore } from './draft-store.svelte';

	interface Props {
		store: FinopsStore;
	}
	let { store }: Props = $props();

	const copy: Record<EnforcementMode, { icon: IconName; blurb: string; accent: string }> = {
		advisory: {
			icon: 'eye',
			blurb: 'Only warns. Nothing is ever blocked. The safe default - and the only mode for an air-gapped install with no proxy.',
			accent: 'brand'
		},
		enforced: {
			icon: 'shield',
			blurb: 'The governor blocks at the LiteLLM gateway: a scope below the readiness bar or a blown budget actually freezes generation.',
			accent: 'danger'
		}
	};
</script>

<div>
	<p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">How strict?</p>
	<div class="grid gap-3 sm:grid-cols-2">
		{#each ENFORCEMENT_MODES as m (m.code)}
			{@const mode = m.code as EnforcementMode}
			{@const c = copy[mode]}
			{@const active = store.draft.enforcementMode === mode}
			<button
				type="button"
				onclick={() => store.setEnforcementMode(mode)}
				class="flex items-start gap-3 rounded-card border p-4 text-left transition-all {active
					? c.accent === 'danger'
						? 'border-danger-300 bg-danger-50/60 ring-1 ring-danger-200'
						: 'border-brand-300 bg-brand-50/60 ring-1 ring-brand-200'
					: 'border-line bg-surface hover:border-line-strong'}"
			>
				<span
					class="grid size-8 shrink-0 place-items-center rounded-lg {active
						? c.accent === 'danger'
							? 'bg-danger-500/15 text-danger-600'
							: 'bg-brand-500/15 text-brand-600'
						: 'bg-surface-sunken text-ink-400'}"
				>
					<Icon name={c.icon} size={16} />
				</span>
				<span class="min-w-0 flex-1">
					<span class="flex items-center gap-1.5">
						<span class="text-sm font-semibold text-ink-800">{m.label}</span>
						{#if active}
							<Icon name="check" size={14} class="text-success-600" />
						{/if}
					</span>
					<span class="mt-0.5 block text-[12px] leading-relaxed text-ink-500">{c.blurb}</span>
				</span>
			</button>
		{/each}
	</div>
</div>
