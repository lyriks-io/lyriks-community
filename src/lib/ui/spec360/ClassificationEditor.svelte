<script lang="ts">
	import { FORM_FACTOR_GROUPS, INDUSTRIES, MARKET_TYPES, PRODUCT_TYPES } from '$domain/foundation';
	import { useEdits } from './edits.svelte';
	import { CHIP, CHIP_ON, FIELD } from './page/look';

	/**
	 * The product's type in its summary's editor, the chips the Overview shows:
	 * its market and product type (one each), its industry (from the catalogue,
	 * or the name the team gave it) and the form factors it is used through
	 * (several, grouped). Saved with the summary.
	 */
	const edits = useEdits();
	const c = $derived(edits.classification);
	const customIndustry = $derived(c?.industry && !INDUSTRIES.some((i) => i.code === c.industry) ? c.industry : null);

	function set(patch: Partial<NonNullable<typeof edits.classification>>) {
		if (edits.classification) edits.classification = { ...edits.classification, ...patch };
	}
	function toggleFactor(code: string) {
		const now = edits.classification?.formFactors ?? [];
		set({ formFactors: now.includes(code) ? now.filter((f) => f !== code) : [...now, code] });
	}

	// The design's field label (.ly-field label) and filter chips (.ly-chip): on, an ink fill.
	const LABEL = 'font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase';
	const chip = (on: boolean) => `min-h-8 px-3 transition-colors ${on ? CHIP_ON : `${CHIP} hover:border-ink`}`;
</script>

{#if c}
	<div class="flex flex-col gap-3 rounded-lg border border-line bg-paper p-3">
		<div class="flex flex-col gap-1.5">
			<span class={LABEL}>Market</span>
			<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Market">
				{#each MARKET_TYPES as m (m.code)}
					<button type="button" role="radio" aria-checked={c.marketType === m.code} title={m.hint} class={chip(c.marketType === m.code)} onclick={() => set({ marketType: m.code })}>{m.label}</button>
				{/each}
			</div>
		</div>
		<div class="flex flex-wrap gap-4">
			<label class="flex min-w-[200px] flex-[1_1_220px] flex-col gap-1.5 {LABEL}">
				Industry
				<select
					class="min-h-9 {FIELD} px-2.5 font-evo text-[0.875rem] font-normal tracking-normal normal-case"
					value={c.industry ?? ''}
					onchange={(e) => set({ industry: e.currentTarget.value || null })}
				>
					<option value="">Not chosen</option>
					{#if customIndustry}<option value={customIndustry}>{customIndustry}</option>{/if}
					{#each INDUSTRIES as i (i.code)}<option value={i.code}>{i.label}</option>{/each}
				</select>
			</label>
			<div class="flex min-w-0 flex-[2_1_320px] flex-col gap-1.5">
				<span class={LABEL}>Product type</span>
				<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Product type">
					{#each PRODUCT_TYPES as p (p.code)}
						<button type="button" role="radio" aria-checked={c.productType === p.code} class={chip(c.productType === p.code)} onclick={() => set({ productType: p.code })}>{p.label}</button>
					{/each}
				</div>
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<span class={LABEL}>Used through</span>
			{#each FORM_FACTOR_GROUPS as g (g.label)}
				<div class="flex flex-wrap items-center gap-1.5">
					<span class="w-[150px] flex-none text-xs text-evo-faint">{g.label}</span>
					{#each g.items as f (f.code)}
						<button type="button" aria-pressed={c.formFactors.includes(f.code)} title={f.hint} class={chip(c.formFactors.includes(f.code))} onclick={() => toggleFactor(f.code)}>{f.label}</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}
