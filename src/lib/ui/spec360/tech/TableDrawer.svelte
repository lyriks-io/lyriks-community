<script lang="ts">
	import { DB_ENGINES, FIELD_TYPES, type DataEntity, type ProjectDataDraft } from '$domain/data';
	import { DrawerSection, SideDrawer } from '$ui/design-system';
	import CitedSources from '$ui/documents/CitedSources.svelte';
	import { KEY_BADGE, fieldKeyOf } from '$ui/data/board/data-map';
	import type { TableUse } from '$application/spec360/data-map';
	import { fieldAccepts, tableRelations } from '$application/spec360/table-details';
	import { anchorOf } from '$domain/discussions';
	import { BTN } from '../page/look';
	import StagedText from '../StagedText.svelte';
	import { useEdits } from '../edits.svelte';

	/**
	 * One table of the data map read in full beside the map (criterion
	 * 3750dbba): where it is stored, what it holds, its fields with their keys,
	 * the features whose states carry it, and the sources it rests on. Each
	 * field says what it accepts (criterion a7ca2255); its relations read in
	 * sentences, each table named a link to it (criterion 51dd6218), with what
	 * a deletion does along each one (criterion 99e7cc77). In the Edit mode its
	 * name and what it holds are fields, held until Save (criterion 41514698).
	 */
	interface Props {
		open: boolean;
		onClose: () => void;
		table: DataEntity;
		data: ProjectDataDraft;
		uses: readonly TableUse[];
		/** The page of a feature, for its link. */
		featureHref: (featureId: string) => string;
		/** Selects another table on the map, whose drawer then shows. */
		onOpenTable: (tableId: string) => void;
	}
	let { open, onClose, table, data, uses, featureHref, onOpenTable }: Props = $props();

	const database = $derived(data.databases.find((d) => d.id === table.databaseId) ?? null);
	const kicker = $derived(
		database
			? ['TABLE', database.name.trim() || 'Untitled database', DB_ENGINES.find((e) => e.code === database.engine)?.label ?? ''].filter(Boolean).join(' · ')
			: 'TABLE · NOT IN A DATABASE'
	);
	const edits = useEdits();
	const anchor = $derived(anchorOf('entity', table.id));
	const read = $derived({ text: table.name.trim() || 'Untitled table', desc: table.description.trim() });
	// A text just saved reads at once, before the page has read the spec again.
	const shown = $derived(edits.shown(anchor, read));
	const fields = $derived(data.fields.filter((f) => f.entityId === table.id && !f.parentFieldId));
	const relations = $derived(tableRelations(data, table.id));
	const tableName = (id: string | null) => (id ? data.entities.find((e) => e.id === id)?.name.trim() || 'Untitled table' : '');
	const typeLabel = (code: string) => FIELD_TYPES.find((t) => t.code === code)?.label ?? code;
	const KEY_LOOK: Record<string, string> = {
		PK: 'bg-evo-orange-soft text-evo-orange',
		FK: 'bg-evo-violet-soft text-evo-violet-ink',
		UK: 'bg-evo-green-soft text-evo-green'
	};
</script>

{#snippet named(t: { id: string; name: string })}
	{#if t.id === table.id}<span class="font-semibold text-evo-ink">{t.name}</span>{:else}<button
			type="button"
			class="cursor-pointer border-0 bg-transparent p-0 font-semibold text-evo-violet-ink hover:underline"
			onclick={() => onOpenTable(t.id)}>{t.name}</button
		>{/if}
{/snippet}

<SideDrawer {open} {onClose} {kicker} title={shown.text}>
	{#snippet heading()}<StagedText {anchor} {read} field="text" label="Name">{shown.text}</StagedText>{/snippet}
	<div class="text-[0.9375rem] leading-[1.55] text-evo-ink-2 empty:hidden">
		<StagedText {anchor} {read} field="desc" multiline label="What it holds">{#if shown.desc}<p class="m-0">{shown.desc}</p>{/if}</StagedText>
	</div>
	<DrawerSection title="{fields.length} {fields.length === 1 ? 'field' : 'fields'}">
		{#each fields as field (field.id)}
			{@const key = KEY_BADGE[fieldKeyOf(field)]}
			{@const accepts = fieldAccepts(field)}
			<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
				<span class="font-evo-mono text-[0.8125rem] font-semibold text-evo-ink">{field.name}</span>
				{#if key}<span class="px-1.5 py-px font-evo-mono text-[0.625rem] font-bold {KEY_LOOK[key]}">{key}</span>{/if}
				{#if field.isRequired}<span class="text-xs text-evo-muted">required</span>{/if}
				{#if field.isList}<span class="text-xs text-evo-muted">list</span>{/if}
				<span class="ml-auto font-evo-mono text-xs text-evo-muted">
					{key === 'FK' && field.relationTargetEntityId ? `→ ${tableName(field.relationTargetEntityId)}` : typeLabel(field.type)}
				</span>
				{#if accepts.values || accepts.default}
					<span class="basis-full font-evo-mono text-xs text-evo-muted">{[accepts.values, accepts.default].filter(Boolean).join(' · ')}</span>
				{/if}
			</div>
		{:else}
			<span class="text-evo-muted">The spec names no field of this table yet.</span>
		{/each}
	</DrawerSection>
	<DrawerSection title="How it relates">
		{#each relations as relation (`${relation.own}-${relation.id}`)}
			<div class="space-y-0.5">
				<p class="m-0">
					Each {@render named(relation.holder)} {relation.verb}
					{#if relation.target}{@render named(relation.target)}{:else}<span class="font-semibold text-evo-red">a table that is not in the model</span>{/if}
					<span class="font-evo-mono text-xs text-evo-muted">({relation.field})</span>
				</p>
				{#if relation.deletion}
					<p class="m-0 text-[0.8125rem] {relation.deletionStated ? 'text-evo-ink-2' : 'text-evo-muted'}">{relation.deletion}</p>
				{/if}
			</div>
		{:else}
			<span class="text-evo-muted">Relates to no other table.</span>
		{/each}
	</DrawerSection>
	<DrawerSection title="Where it applies">
		{#each uses as use (use.id)}
			<a href={featureHref(use.id)} class="flex flex-wrap items-baseline gap-x-2 font-semibold text-evo-violet-ink no-underline hover:underline">
				{use.name}<span class="text-xs font-normal text-evo-muted">{use.core}</span>
			</a>
		{:else}
			<span class="text-evo-muted">No feature uses it yet: none of its fields carries the state of a feature.</span>
		{/each}
	</DrawerSection>
	<DrawerSection title="Sources">
		<div><CitedSources ids={table.sourceIds} emptyLabel="This table cites no source yet." /></div>
	</DrawerSection>
	{#snippet foot()}
		<button type="button" class={BTN} onclick={onClose}>Close</button>
	{/snippet}
</SideDrawer>
