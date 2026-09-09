<script lang="ts">
	import { Card, TextInput, IconButton, Button, Icon } from '$ui/design-system';
	import {
		brandNewId,
		type BrandFontSlot,
		type BrandTypeSize,
		type BrandFontWeight
	} from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const typo = $derived(store.draft.brand.typography);
	const NUM = 'w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none transition-colors hover:border-line-strong focus:border-brand-400';

	const SLOTS: BrandFontSlot[] = ['heading', 'body', 'mono'];
	const setFamily = (slot: BrandFontSlot, k: 'stack' | 'fallback', v: string) =>
		store.setBrand(`typography.families.${slot}.${k}`, v);

	const setScale = (s: BrandTypeSize[]) => store.setBrand('typography.scale', s);
	function addSize(preset: Partial<BrandTypeSize>) {
		setScale([...typo.scale, { id: brandNewId('sz'), name: '', valuePx: 16, lineHeight: 1.5, usage: '', ...preset }]);
	}
	const patchSize = (id: string, p: Partial<BrandTypeSize>) =>
		setScale(typo.scale.map((t) => (t.id === id ? { ...t, ...p } : t)));

	const setWeights = (w: BrandFontWeight[]) => store.setBrand('typography.weights', w);
	function addWeight(preset: Partial<BrandFontWeight>) {
		setWeights([...typo.weights, { id: brandNewId('wt'), name: '', value: 400, usage: '', ...preset }]);
	}
	const patchWeight = (id: string, p: Partial<BrandFontWeight>) =>
		setWeights(typo.weights.map((w) => (w.id === id ? { ...w, ...p } : w)));

	const SIZE_PRESETS: { label: string; preset: Partial<BrandTypeSize> }[] = [
		{ label: 'sm', preset: { name: 'sm', valuePx: 14, usage: 'Captions, helper text' } },
		{ label: 'base', preset: { name: 'base', valuePx: 16, usage: 'Body copy' } },
		{ label: 'lg', preset: { name: 'lg', valuePx: 20, usage: 'Section titles' } },
		{ label: 'xl', preset: { name: 'xl', valuePx: 28, usage: 'Page headlines' } },
		{ label: 'Custom', preset: {} }
	];
	const WEIGHT_PRESETS: { label: string; preset: Partial<BrandFontWeight> }[] = [
		{ label: 'Regular', preset: { name: 'regular', value: 400 } },
		{ label: 'Medium', preset: { name: 'medium', value: 500 } },
		{ label: 'Bold', preset: { name: 'bold', value: 700 } },
		{ label: 'Custom', preset: {} }
	];
</script>

<Card class="space-y-6">
	<BrandSectionHeader kicker="Typography" title="Font families, scale & weights" />

	<div class="space-y-2">
		<p class="text-[11px] font-bold uppercase tracking-widest text-ink-400">Font families</p>
		{#each SLOTS as slot (slot)}
			<div class="flex items-center gap-3 rounded-field border border-line bg-surface-sunken p-2.5">
				<span class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-ink-400">{slot}</span>
				<div class="grid flex-1 gap-2 md:grid-cols-2">
					<TextInput
						value={typo.families[slot].stack}
						placeholder={slot === 'mono' ? '"JetBrains Mono", ui-monospace' : '"Inter", sans-serif'}
						oninput={(v) => setFamily(slot, 'stack', v)}
					/>
					<TextInput value={typo.families[slot].fallback} placeholder="system-ui, sans-serif" oninput={(v) => setFamily(slot, 'fallback', v)} />
				</div>
			</div>
		{/each}
	</div>

	<div class="space-y-2">
		<p class="text-[11px] font-bold uppercase tracking-widest text-ink-400">Type scale</p>
		{#each typo.scale as t (t.id)}
			<div class="flex items-start gap-2 rounded-field border border-line bg-surface-sunken p-2.5">
				<div class="grid flex-1 gap-2 md:grid-cols-[1fr_100px_100px_1fr]">
					<TextInput value={t.name} placeholder="base" oninput={(v) => patchSize(t.id, { name: v })} />
					<input type="number" class={NUM} value={t.valuePx} oninput={(e) => patchSize(t.id, { valuePx: Number(e.currentTarget.value) || 0 })} aria-label="px" />
					<input type="number" step="0.1" class={NUM} value={t.lineHeight} oninput={(e) => patchSize(t.id, { lineHeight: Number(e.currentTarget.value) || 0 })} aria-label="line height" />
					<TextInput value={t.usage} placeholder="Body copy" oninput={(v) => patchSize(t.id, { usage: v })} />
				</div>
				<IconButton name="x" label="Remove size" danger onclick={() => setScale(typo.scale.filter((s) => s.id !== t.id))} />
			</div>
		{/each}
		<div class="flex flex-wrap gap-1.5">
			{#each SIZE_PRESETS as p (p.label)}
				<Button variant="soft" size="sm" onclick={() => addSize(p.preset)}><Icon name="plus" size={12} /> {p.label}</Button>
			{/each}
		</div>
	</div>

	<div class="space-y-2">
		<p class="text-[11px] font-bold uppercase tracking-widest text-ink-400">Weights</p>
		{#each typo.weights as w (w.id)}
			<div class="flex items-start gap-2 rounded-field border border-line bg-surface-sunken p-2.5">
				<div class="grid flex-1 gap-2 md:grid-cols-[1fr_100px_1fr]">
					<TextInput value={w.name} placeholder="medium" oninput={(v) => patchWeight(w.id, { name: v })} />
					<input type="number" class={NUM} value={w.value} oninput={(e) => patchWeight(w.id, { value: Number(e.currentTarget.value) || 0 })} aria-label="weight" />
					<TextInput value={w.usage} placeholder="Emphasis" oninput={(v) => patchWeight(w.id, { usage: v })} />
				</div>
				<IconButton name="x" label="Remove weight" danger onclick={() => setWeights(typo.weights.filter((x) => x.id !== w.id))} />
			</div>
		{/each}
		<div class="flex flex-wrap gap-1.5">
			{#each WEIGHT_PRESETS as p (p.label)}
				<Button variant="soft" size="sm" onclick={() => addWeight(p.preset)}><Icon name="plus" size={12} /> {p.label}</Button>
			{/each}
		</div>
	</div>
</Card>
