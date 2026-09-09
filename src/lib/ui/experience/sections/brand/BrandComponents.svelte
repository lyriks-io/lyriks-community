<script lang="ts">
	import { Card, TextInput, Textarea, IconButton, Button, Icon } from '$ui/design-system';
	import {
		brandNewId,
		resolveMarkers,
		resolveToken,
		BRAND_SEMANTIC_KEYS,
		type BrandComponent,
		type BrandComponentTokens
	} from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';
	import BrandTokenSelect, { type TokenOption } from './BrandTokenSelect.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const brand = $derived(store.draft.brand);
	const list = $derived(brand.components);
	const markers = $derived(resolveMarkers(brand));

	// Candidate components come from the Experience library (elements + components).
	const library = $derived([
		...store.draft.elements.map((c) => ({ name: c.name || c.id, kind: 'element' as const })),
		...store.draft.components.map((c) => ({ name: c.name || c.id, kind: 'component' as const }))
	].filter((c) => c.name));
	const usedNames = $derived(new Set(list.map((c) => c.refName)));
	const unattached = $derived(library.filter((c) => !usedNames.has(c.name)));

	const setList = (v: BrandComponent[]) => store.setBrand('components', v);
	function addComp(refName: string, refKind: string) {
		setList([
			...list,
			{
				id: brandNewId('cmp'),
				refName,
				refKind,
				variants: [],
				states: [],
				dos: '',
				donts: '',
				codeExample: '',
				tokens: { bgColor: '', textColor: '', fontFamily: 'body', fontSize: '', fontWeight: '' }
			}
		]);
	}
	function syncAll() {
		if (unattached.length) setList([...list, ...unattached.map((c) => makeBlank(c.name, c.kind))]);
	}
	function makeBlank(refName: string, refKind: string): BrandComponent {
		return { id: brandNewId('cmp'), refName, refKind, variants: [], states: [], dos: '', donts: '', codeExample: '', tokens: { bgColor: '', textColor: '', fontFamily: 'body', fontSize: '', fontWeight: '' } };
	}
	const patch = (id: string, p: Partial<BrandComponent>) => setList(list.map((c) => (c.id === id ? { ...c, ...p } : c)));
	const patchTokens = (id: string, p: Partial<BrandComponentTokens>) =>
		setList(list.map((c) => (c.id === id ? { ...c, tokens: { ...c.tokens, ...p } } : c)));
	const remove = (id: string) => setList(list.filter((c) => c.id !== id));

	// Token dropdown option builders.
	const colorOptions = $derived<TokenOption[]>([
		{ value: '', label: '- inherit -' },
		...brand.colors.tokens.filter((t) => t.name).map((t) => ({ value: t.name, label: t.name, swatch: t.value })),
		...BRAND_SEMANTIC_KEYS.filter((s) => brand.colors.semantic[s.key]).map((s) => ({
			value: s.key,
			label: `semantic.${s.key}`,
			swatch: brand.colors.semantic[s.key]
		}))
	]);
	const familyOptions = $derived<TokenOption[]>([
		{ value: '', label: '- inherit -' },
		{ value: 'heading', label: 'heading' },
		{ value: 'body', label: 'body' },
		{ value: 'mono', label: 'mono' }
	]);
	const sizeOptions = $derived<TokenOption[]>([
		{ value: '', label: '- inherit -' },
		...brand.typography.scale.filter((t) => t.name).map((t) => ({ value: t.name, label: `${t.name} (${t.valuePx}px)` }))
	]);
	const weightOptions = $derived<TokenOption[]>([
		{ value: '', label: '- inherit -' },
		...brand.typography.weights.filter((t) => t.name).map((t) => ({ value: t.name, label: `${t.name} (${t.value})` }))
	]);

	function preview(c: BrandComponent) {
		return {
			background: resolveToken(brand, 'color', c.tokens.bgColor) || markers.fallbackBg,
			color: resolveToken(brand, 'color', c.tokens.textColor) || markers.fallbackText,
			fontFamily: resolveToken(brand, 'fontFamily', c.tokens.fontFamily || 'body') || 'inherit',
			fontSize: resolveToken(brand, 'fontSize', c.tokens.fontSize) || '14px',
			fontWeight: resolveToken(brand, 'fontWeight', c.tokens.fontWeight) || '500'
		};
	}
	const KIND_BADGE: Record<string, { label: string; cls: string }> = {
		element: { label: 'EL', cls: 'bg-success-50 text-success-600' },
		component: { label: 'CO', cls: 'bg-brand-50 text-brand-600' }
	};
	const badge = (kind: string) => KIND_BADGE[kind] ?? { label: 'CU', cls: 'bg-surface-sunken text-ink-500' };
</script>

<Card class="space-y-4">
	<BrandSectionHeader kicker="Components" title="Map library components to brand tokens" />

	<div class="flex flex-wrap items-center gap-2 text-xs text-ink-500">
		<span>Experience library · {library.length} items · {unattached.length} not yet attached</span>
		<div class="ml-auto flex gap-1.5">
			<Button variant="soft" size="sm" onclick={syncAll} disabled={unattached.length === 0}>
				<Icon name="plus" size={12} /> Attach all
			</Button>
			<Button variant="outline" size="sm" onclick={() => addComp('', 'custom')}>
				<Icon name="plus" size={12} /> Blank
			</Button>
		</div>
	</div>

	{#if unattached.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each unattached.slice(0, 24) as c (c.name)}
				<button
					type="button"
					onclick={() => addComp(c.name, c.kind)}
					class="inline-flex items-center gap-1.5 rounded-field border border-line bg-surface px-2.5 py-1 text-xs text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-600"
				>
					<span class="rounded px-1 text-[9px] font-bold {badge(c.kind).cls}">{badge(c.kind).label.slice(0, 2).toLowerCase()}</span>
					{c.name}
				</button>
			{/each}
		</div>
	{/if}

	{#if list.length === 0}
		<p class="py-6 text-center text-sm italic text-ink-400">No component mapped yet - attach one from the library above.</p>
	{/if}

	<div class="space-y-3">
		{#each list as c (c.id)}
			{@const p = preview(c)}
			<div class="space-y-3 rounded-field border border-line bg-surface-sunken p-3">
				<div class="flex items-center gap-2">
					<span class="rounded px-1.5 py-0.5 text-[10px] font-bold {badge(c.refKind).cls}">{badge(c.refKind).label}</span>
					<div class="flex-1"><TextInput value={c.refName} placeholder="Component name" oninput={(v) => patch(c.id, { refName: v })} /></div>
					<IconButton name="x" label="Remove component" danger onclick={() => remove(c.id)} />
				</div>

				<div class="grid grid-cols-2 gap-2 md:grid-cols-5">
					<BrandTokenSelect label="Background" value={c.tokens.bgColor} options={colorOptions} swatchKey onChange={(v) => patchTokens(c.id, { bgColor: v })} />
					<BrandTokenSelect label="Text color" value={c.tokens.textColor} options={colorOptions} swatchKey onChange={(v) => patchTokens(c.id, { textColor: v })} />
					<BrandTokenSelect label="Font family" value={c.tokens.fontFamily} options={familyOptions} onChange={(v) => patchTokens(c.id, { fontFamily: v })} />
					<BrandTokenSelect label="Font size" value={c.tokens.fontSize} options={sizeOptions} onChange={(v) => patchTokens(c.id, { fontSize: v })} />
					<BrandTokenSelect label="Font weight" value={c.tokens.fontWeight} options={weightOptions} onChange={(v) => patchTokens(c.id, { fontWeight: v })} />
				</div>

				<div class="rounded-field border border-dashed border-line bg-surface p-4">
					<span
						style="display:inline-block;background:{p.background};color:{p.color};font-family:{p.fontFamily};font-size:{p.fontSize};font-weight:{p.fontWeight};padding:{markers.padding};border-radius:{markers.radius};box-shadow:{markers.shadow};border:{markers.border};transition:{markers.transition};text-transform:{markers.textTransform}"
					>
						{c.refName || 'Sample'}
					</span>
				</div>

				<div class="grid gap-2 md:grid-cols-2">
					<TextInput value={c.variants.join(', ')} placeholder="Variants: primary, secondary, ghost" oninput={(v) => patch(c.id, { variants: v.split(',').map((s) => s.trim()).filter(Boolean) })} />
					<TextInput value={c.states.join(', ')} placeholder="States: hover, active, disabled, loading" oninput={(v) => patch(c.id, { states: v.split(',').map((s) => s.trim()).filter(Boolean) })} />
				</div>
				<div class="grid gap-2 md:grid-cols-2">
					<Textarea value={c.dos} rows={3} placeholder="Do…" oninput={(v) => patch(c.id, { dos: v })} />
					<Textarea value={c.donts} rows={3} placeholder="Don't…" oninput={(v) => patch(c.id, { donts: v })} />
				</div>
				<Textarea value={c.codeExample} rows={4} placeholder="Code example (optional)" oninput={(v) => patch(c.id, { codeExample: v })} />
			</div>
		{/each}
	</div>
</Card>
