<script lang="ts">
	import { Button, Field, Icon, IconButton, SectionCard, Select, TextInput, Textarea } from '$ui/design-system';
	import { FLAG_DEFAULTS, MIGRATION_STRATEGIES, type FlagDefault, type MigrationStrategy } from '$domain/foundation';
	import type { OperationsStore } from '../operations-store.svelte';

	interface Props {
		store: OperationsStore;
	}
	let { store }: Props = $props();
	const migration = $derived(store.draft.migration);

	const STRATEGY_OPTIONS = [{ code: '', label: '- pick one -' }, ...MIGRATION_STRATEGIES];
</script>

<SectionCard
	eyebrow="Migration"
	icon="layers"
	title="Roll-out, backfill, rollback, feature flags"
	subtitle="How the change ships and what happens if it goes wrong."
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="Roll-out strategy">
			<Select
				value={migration.strategy}
				options={STRATEGY_OPTIONS}
				onchange={(v) => store.setMigrationField('strategy', v as MigrationStrategy | '')}
			/>
		</Field>
		<Field label="Backward-compat window" hint="How long the old behavior must keep working.">
			<TextInput value={migration.backwardCompatWindow} placeholder="2 sprints / 30 days" oninput={(v) => store.setMigrationField('backwardCompatWindow', v)} />
		</Field>
	</div>

	<Field label="Data backfill plan" hint="What needs to be re-computed / migrated and how.">
		<Textarea value={migration.dataBackfill} rows={3} placeholder="Add new column nullable, backfill via async job in batches of 500, then make non-null in v2." oninput={(v) => store.setMigrationField('dataBackfill', v)} />
	</Field>
	<Field label="Rollback plan" hint="What happens if it goes wrong.">
		<Textarea value={migration.rollbackPlan} rows={3} placeholder="Flip newBilling=off, run revert-migration.sql, monitor error rate for 1h." oninput={(v) => store.setMigrationField('rollbackPlan', v)} />
	</Field>

	<Field label="Feature flags expected" hint="Each one the LLM should plumb in code.">
		<div class="space-y-2">
			{#each migration.flagsExpected as flag (flag.id)}
				<div class="flex items-center gap-2">
					<div class="flex-1">
						<TextInput value={flag.flag} placeholder="flag.name" oninput={(v) => store.updateFlag(flag.id, 'flag', v)} />
					</div>
					<div class="w-28 shrink-0">
						<Select
							value={flag.default}
							options={FLAG_DEFAULTS}
							onchange={(v) => store.updateFlag(flag.id, 'default', v as FlagDefault)}
						/>
					</div>
					<div class="w-32 shrink-0">
						<TextInput value={flag.owner} placeholder="owner" oninput={(v) => store.updateFlag(flag.id, 'owner', v)} />
					</div>
					<div class="flex-1">
						<TextInput value={flag.killCriteria} placeholder="Kill criteria" oninput={(v) => store.updateFlag(flag.id, 'killCriteria', v)} />
					</div>
					<IconButton name="x" label="Remove flag" danger onclick={() => store.removeFlag(flag.id)} />
				</div>
			{/each}
			<Button variant="soft" size="sm" onclick={store.addFlag}>
				<Icon name="plus" size={14} /> Flag
			</Button>
		</div>
	</Field>

	<Field label="Notes">
		<Textarea value={migration.notes} rows={2} placeholder="Anything else worth knowing." oninput={(v) => store.setMigrationField('notes', v)} />
	</Field>
</SectionCard>
