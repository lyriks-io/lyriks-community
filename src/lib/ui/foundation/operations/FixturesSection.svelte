<script lang="ts">
	import { Button, Field, Icon, IconButton, SectionCard, TextInput, Textarea } from '$ui/design-system';
	import type { OperationsStore } from '../operations-store.svelte';

	interface Props {
		store: OperationsStore;
	}
	let { store }: Props = $props();
	const fixtures = $derived(store.draft.testFixtures);
</script>

<SectionCard
	eyebrow="Test fixtures"
	icon="database"
	title="Realistic sample data the LLM imitates"
	subtitle="A couple of realistic data sets per critical entity."
>
	<div class="space-y-3">
		{#each fixtures as fx (fx.id)}
			<div class="space-y-2 rounded-field border border-ink-100 bg-surface-sunken p-3">
				<div class="flex items-start gap-2">
					<div class="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
						<TextInput value={fx.name} placeholder="3-invoices-mixed-status" oninput={(v) => store.updateFixture(fx.id, 'name', v)} />
						<TextInput value={fx.scope} placeholder="entity / feature scope" oninput={(v) => store.updateFixture(fx.id, 'scope', v)} />
						<TextInput value={fx.description} placeholder="What this fixture represents" oninput={(v) => store.updateFixture(fx.id, 'description', v)} />
					</div>
					<IconButton name="x" label="Remove fixture" danger onclick={() => store.removeFixture(fx.id)} />
				</div>
				<Field label="Sample data (JSON)">
					<Textarea
						value={fx.dataJson}
						rows={5}
						class="font-mono text-xs"
						placeholder={'[{ "id": "inv_1", "status": "paid", "amount": 1200 }]'}
						oninput={(v) => store.updateFixture(fx.id, 'dataJson', v)}
					/>
				</Field>
			</div>
		{/each}
		{#if fixtures.length === 0}
			<p class="text-sm italic text-ink-400">No fixture yet. Add a couple of realistic data sets per critical entity.</p>
		{/if}
		<Button variant="soft" size="sm" onclick={store.addFixture}>
			<Icon name="plus" size={14} /> New fixture
		</Button>
	</div>
</SectionCard>
