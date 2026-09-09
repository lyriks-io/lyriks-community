<script lang="ts">
	import { Card, Field, TextInput, Textarea, TagInput } from '$ui/design-system';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';
	import BrandFileInput from './BrandFileInput.svelte';
	import { toFileRef } from './brand-io';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const id = $derived(store.draft.brand.identity);
	const set = (k: string, v: unknown) => store.setBrand(`identity.${k}`, v);
</script>

<Card class="space-y-5">
	<BrandSectionHeader kicker="Identity" title="Name, mission, tone of voice" />

	<Field label="Brand name">
		<TextInput value={id.name} placeholder="e.g. Acme Pay" oninput={(v) => set('name', v)} />
	</Field>

	<Field label="Baseline / tagline">
		<TextInput value={id.baseline} placeholder="What the product promises in a few words" oninput={(v) => set('baseline', v)} />
	</Field>

	<Field label="Mission in one sentence">
		<Textarea value={id.missionOneLiner} rows={3} placeholder="Why the product exists." oninput={(v) => set('missionOneLiner', v)} />
	</Field>

	<Field label="Tone of voice" hint="3 to 5 adjectives">
		<TagInput
			tags={id.toneAdjectives}
			tone="brand"
			placeholder="Type + Enter"
			onadd={(t) => set('toneAdjectives', [...id.toneAdjectives, t])}
			onremove={(i) => set('toneAdjectives', id.toneAdjectives.filter((_, j) => j !== i))}
		/>
	</Field>

	<div class="grid gap-4 md:grid-cols-2">
		<Field label="Do say" hint="Concrete sentences the brand would happily produce.">
			<Textarea value={id.toneDoSay} rows={4} oninput={(v) => set('toneDoSay', v)} />
		</Field>
		<Field label="Don't say">
			<Textarea value={id.toneDontSay} rows={4} oninput={(v) => set('toneDontSay', v)} />
		</Field>
	</div>

	<Field label="Visual personality">
		<Textarea value={id.visualPersonality} rows={3} placeholder="Bold and minimal, warm and human, technical and precise…" oninput={(v) => set('visualPersonality', v)} />
	</Field>

	<Field label="Brandbook - key rules summary">
		<Textarea value={id.brandbookSummary} rows={4} oninput={(v) => set('brandbookSummary', v)} />
	</Field>

	<Field label="Brandbook PDF">
		<BrandFileInput
			accept="application/pdf"
			current={id.brandbookFile}
			hint="PDF"
			onLoaded={(f) => set('brandbookFile', toFileRef(f))}
			onClear={() => set('brandbookFile', null)}
		/>
		<div class="mt-2">
			<TextInput type="url" value={id.brandbookUrl} placeholder="or external link" oninput={(v) => set('brandbookUrl', v)} />
		</div>
	</Field>
</Card>
