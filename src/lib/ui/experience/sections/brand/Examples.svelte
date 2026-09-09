<script lang="ts">
	import { Card, TextInput, Textarea, IconButton, Button, Icon } from '$ui/design-system';
	import { brandNewId, type BrandExample } from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const examples = $derived(store.draft.brand.examples);
	const setEx = (v: BrandExample[]) => store.setBrand('examples', v);
	const addEx = () =>
		setEx([...examples, { id: brandNewId('ex'), title: '', goodSnippet: '', goodCode: '', badSnippet: '', badCode: '', explanation: '' }]);
	const patch = (id: string, p: Partial<BrandExample>) => setEx(examples.map((x) => (x.id === id ? { ...x, ...p } : x)));
	const remove = (id: string) => setEx(examples.filter((x) => x.id !== id));
</script>

<Card class="space-y-4">
	<BrandSectionHeader kicker="Examples" title="Good vs bad, so the model learns the boundary" />

	{#if examples.length === 0}
		<p class="py-4 text-center text-sm italic text-ink-400">No example pair yet.</p>
	{/if}

	<div class="space-y-3">
		{#each examples as e (e.id)}
			<div class="space-y-3 rounded-field border border-line bg-surface-sunken p-3">
				<div class="flex items-center gap-2">
					<div class="flex-1"><TextInput value={e.title} placeholder="Example title" oninput={(v) => patch(e.id, { title: v })} /></div>
					<IconButton name="x" label="Remove example" danger onclick={() => remove(e.id)} />
				</div>
				<div class="grid gap-3 md:grid-cols-2">
					<div class="space-y-2">
						<p class="text-[11px] font-bold uppercase tracking-widest text-success-600">Do</p>
						<Textarea value={e.goodSnippet} rows={3} placeholder="What the good version looks like." oninput={(v) => patch(e.id, { goodSnippet: v })} />
						<Textarea value={e.goodCode} rows={4} placeholder="Good code (optional)" oninput={(v) => patch(e.id, { goodCode: v })} />
					</div>
					<div class="space-y-2">
						<p class="text-[11px] font-bold uppercase tracking-widest text-danger-500">Don't</p>
						<Textarea value={e.badSnippet} rows={3} placeholder="What to avoid." oninput={(v) => patch(e.id, { badSnippet: v })} />
						<Textarea value={e.badCode} rows={4} placeholder="Bad code (optional)" oninput={(v) => patch(e.id, { badCode: v })} />
					</div>
				</div>
				<Textarea value={e.explanation} rows={2} placeholder="Why the good one is better." oninput={(v) => patch(e.id, { explanation: v })} />
			</div>
		{/each}
	</div>

	<Button variant="soft" size="sm" onclick={addEx}><Icon name="plus" size={12} /> Add example pair</Button>
</Card>
