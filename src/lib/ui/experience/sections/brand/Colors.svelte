<script lang="ts">
	import { Card, TextInput, IconButton, Button, Icon } from '$ui/design-system';
	import {
		brandNewId,
		BRAND_SEMANTIC_KEYS,
		type BrandColorToken,
		type BrandSemanticKey
	} from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const colors = $derived(store.draft.brand.colors);
	const setTokens = (t: BrandColorToken[]) => store.setBrand('colors.tokens', t);

	function addToken(preset: Partial<BrandColorToken>) {
		setTokens([...colors.tokens, { id: brandNewId('col'), name: '', value: '#000000', usage: '', ...preset }]);
	}
	function patch(id: string, p: Partial<BrandColorToken>) {
		setTokens(colors.tokens.map((t) => (t.id === id ? { ...t, ...p } : t)));
	}
	function remove(id: string) {
		setTokens(colors.tokens.filter((t) => t.id !== id));
	}

	const PRESETS: { label: string; preset: Partial<BrandColorToken> }[] = [
		{ label: 'Primary', preset: { name: 'color-primary', usage: 'Primary actions, CTA' } },
		{ label: 'Secondary', preset: { name: 'color-secondary', usage: 'Secondary actions' } },
		{ label: 'Accent', preset: { name: 'color-accent', usage: 'Highlights' } },
		{ label: 'Custom', preset: {} }
	];

	const setSemantic = (k: BrandSemanticKey, v: string) => store.setBrand(`colors.semantic.${k}`, v);
</script>

<Card class="space-y-6">
	<BrandSectionHeader kicker="Colors" title="Color tokens & semantic mapping" />

	<div class="space-y-2">
		<p class="text-[11px] font-bold uppercase tracking-widest text-ink-400">Color tokens</p>
		{#each colors.tokens as t (t.id)}
			<div class="flex items-start gap-2 rounded-field border border-line bg-surface-sunken p-2.5">
				<span class="size-10 shrink-0 rounded border border-line" style="background:{t.value || '#000'}"></span>
				<div class="grid flex-1 gap-2 md:grid-cols-[1fr_140px_1fr]">
					<TextInput value={t.name} placeholder="color-primary" oninput={(v) => patch(t.id, { name: v })} />
					<TextInput value={t.value} placeholder="#1A1A2E" oninput={(v) => patch(t.id, { value: v })} />
					<TextInput value={t.usage} placeholder="Where it is used" oninput={(v) => patch(t.id, { usage: v })} />
				</div>
				<IconButton name="x" label="Remove token" danger onclick={() => remove(t.id)} />
			</div>
		{/each}
		<div class="flex flex-wrap gap-1.5">
			{#each PRESETS as p (p.label)}
				<Button variant="soft" size="sm" onclick={() => addToken(p.preset)}>
					<Icon name="plus" size={12} /> {p.label}
				</Button>
			{/each}
		</div>
	</div>

	<div class="space-y-2">
		<p class="text-[11px] font-bold uppercase tracking-widest text-ink-400">Semantic colors</p>
		<div class="grid gap-2 md:grid-cols-2">
			{#each BRAND_SEMANTIC_KEYS as s (s.key)}
				{@const val = colors.semantic[s.key]}
				<div class="flex items-center gap-2 rounded-field border border-line bg-surface-sunken p-2">
					<span class="size-8 shrink-0 rounded border border-line" style="background:{val || 'transparent'}"></span>
					<div class="min-w-0 flex-1">
						<div class="truncate text-[10px] font-semibold uppercase tracking-widest text-ink-400">{s.label}</div>
						<TextInput value={val} placeholder="#FFFFFF or color-token-name" oninput={(v) => setSemantic(s.key, v)} class="mt-0.5" />
					</div>
				</div>
			{/each}
		</div>
	</div>
</Card>
