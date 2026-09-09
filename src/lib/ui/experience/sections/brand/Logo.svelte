<script lang="ts">
	import { Card, Field, TextInput, Textarea, IconButton, Button, Icon } from '$ui/design-system';
	import { brandNewId, type BrandLogoVariant } from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';
	import BrandFileInput from './BrandFileInput.svelte';
	import { toFileRef } from './brand-io';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const logo = $derived(store.draft.brand.logo);
	const setVariants = (v: BrandLogoVariant[]) => store.setBrand('logo.variants', v);
	const setRule = (k: string, v: string) => store.setBrand(`logo.rules.${k}`, v);

	function addVariant(label: string) {
		setVariants([...logo.variants, { id: brandNewId('logo'), label, file: null, url: '', role: '' }]);
	}
	function patch(id: string, patch: Partial<BrandLogoVariant>) {
		setVariants(logo.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)));
	}
	function remove(id: string) {
		setVariants(logo.variants.filter((v) => v.id !== id));
	}

	const PRESETS = ['Primary', 'Monochrome', 'Favicon', 'Custom'];
</script>

<Card class="space-y-5">
	<BrandSectionHeader kicker="Logo & assets" title="Logo variants & usage rules" />

	<div class="space-y-2">
		{#each logo.variants as v (v.id)}
			<div class="flex items-start gap-2 rounded-field border border-line bg-surface-sunken p-2.5">
				<div class="grid flex-1 gap-2 md:grid-cols-[140px_1fr_1fr]">
					<TextInput value={v.label} placeholder="primary" oninput={(val) => patch(v.id, { label: val })} />
					<BrandFileInput
						accept="image/*,application/pdf,.svg"
						current={v.file}
						hint="PNG/SVG/PDF"
						onLoaded={(f) => patch(v.id, { file: toFileRef(f) })}
						onClear={() => patch(v.id, { file: null })}
					/>
					<TextInput type="url" value={v.url} placeholder="or external URL" oninput={(val) => patch(v.id, { url: val })} />
				</div>
				<IconButton name="x" label="Remove variant" danger onclick={() => remove(v.id)} />
			</div>
		{/each}
		<div class="flex flex-wrap gap-1.5">
			{#each PRESETS as p (p)}
				<Button variant="soft" size="sm" onclick={() => addVariant(p === 'Custom' ? '' : p)}>
					<Icon name="plus" size={12} /> {p}
				</Button>
			{/each}
		</div>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<Field label="Clear space rule">
			<Textarea value={logo.rules.clearSpace} rows={3} oninput={(val) => setRule('clearSpace', val)} />
		</Field>
		<Field label="Allowed backgrounds">
			<Textarea value={logo.rules.backgroundsAllowed} rows={3} oninput={(val) => setRule('backgroundsAllowed', val)} />
		</Field>
		<Field label="Forbidden backgrounds / contexts">
			<Textarea value={logo.rules.backgroundsForbidden} rows={3} oninput={(val) => setRule('backgroundsForbidden', val)} />
		</Field>
		<Field label="Additional do's & don'ts">
			<Textarea value={logo.rules.additionalDoDont} rows={4} oninput={(val) => setRule('additionalDoDont', val)} />
		</Field>
	</div>
</Card>
