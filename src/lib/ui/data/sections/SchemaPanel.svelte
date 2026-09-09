<script lang="ts">
	import { Icon } from '$ui/design-system';
	import {
		FIELD_TYPES,
		childFieldsOfField,
		rootFieldsOfEntity,
		renderEntitySchema,
		type EntityField,
		type FieldType
	} from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';

	interface Props {
		store: DataStore;
		entityId: string;
	}
	let { store, entityId }: Props = $props();
	let mode = $state<'edit' | 'read'>('edit');

	const entity = $derived(store.draft.entities.find((e) => e.id === entityId));
	const fields = $derived(entity ? rootFieldsOfEntity(store.draft, entity.id) : []);
	const otherEntities = $derived(store.draft.entities.filter((e) => e.id !== entityId));
	const placeOptions = $derived(store.draft.databases);
	const code = $derived(entity ? renderEntitySchema(entity, store.draft) : '');

	const childFields = (fieldId: string) => childFieldsOfField(store.draft, fieldId);
</script>

{#if entity}
	<div class="space-y-3 rounded-card border border-line bg-surface-sunken/30 p-3">
		<div class="flex items-center gap-2">
			<input
				value={entity.name}
				oninput={(e) => store.updateEntity(entity.id, 'name', e.currentTarget.value)}
				placeholder="Table name"
				class="min-w-0 flex-1 border-none bg-transparent text-sm font-bold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
			/>
			<select
				value={entity.databaseId ?? ''}
				onchange={(e) => store.updateEntity(entity.id, 'databaseId', e.currentTarget.value || null)}
				class="rounded-field border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-600"
			>
				<option value="">- place on db -</option>
				{#each placeOptions as db (db.id)}
					<option value={db.id}>{db.name || 'db'}</option>
				{/each}
			</select>
			<button
				type="button"
				onclick={() => store.removeEntity(entity.id)}
				class="text-ink-300 hover:text-danger-500"
				title="Delete table"><Icon name="x" size={15} /></button
			>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="inline-flex rounded-field border border-line bg-surface-sunken p-0.5 text-[11px]">
				<button
					type="button"
					onclick={() => (mode = 'edit')}
					class="rounded-md px-2 py-1 font-semibold {mode === 'edit'
						? 'bg-surface text-ink-900 shadow-sm'
						: 'text-ink-400 hover:text-ink-700'}"
				>
					Editable
				</button>
				<button
					type="button"
					onclick={() => (mode = 'read')}
					class="rounded-md px-2 py-1 font-semibold {mode === 'read'
						? 'bg-surface text-ink-900 shadow-sm'
						: 'text-ink-400 hover:text-ink-700'}"
				>
					Readable
				</button>
			</div>
			{#if mode === 'edit'}
				<button
					type="button"
					onclick={() => store.addField(entity.id)}
					class="text-[11px] font-medium text-brand-600 hover:underline">+ field</button
				>
			{/if}
		</div>

		{#if mode === 'edit'}
			<!-- field editor -->
			<div class="space-y-2">
				{#each fields as field (field.id)}
					{@render fieldRow(field, 0)}
				{:else}
					<p class="rounded-field border border-dashed border-line bg-surface px-3 py-6 text-center text-xs text-ink-400">
						No field yet.
					</p>
				{/each}
			</div>
		{:else}
			<!-- generated schema -->
			<div>
				<p class="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
					Readable structure
				</p>
				<pre class="overflow-x-auto rounded-field border border-line bg-ink-900/90 p-3 font-mono text-[11px] leading-relaxed text-ink-100">{code}</pre>
			</div>
		{/if}
	</div>

	{#snippet fieldRow(field: EntityField, depth: number)}
		{@const children = childFields(field.id)}
		<div class="relative">
			{#if depth > 0}
				<div
					class="absolute bottom-0 top-0 w-px bg-line"
					style="left:{Math.max(0, depth * 18 - 9)}px"
				></div>
			{/if}
			<div
				class="rounded-field border border-line bg-surface p-2 shadow-sm"
				style="margin-left:{depth * 18}px"
			>
				<div class="flex flex-wrap items-center gap-1.5">
					<input
						value={field.name}
						oninput={(e) => store.updateField(field.id, 'name', e.currentTarget.value)}
						placeholder={depth === 0 ? 'field' : 'nested field'}
						class="min-w-28 flex-1 rounded border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 outline-none focus:border-brand-300"
					/>
					<select
						value={field.type}
						onchange={(e) => store.setFieldType(field.id, e.currentTarget.value as FieldType)}
						class="rounded border border-line bg-surface px-1.5 py-1 text-[10px] text-ink-600"
					>
						{#each FIELD_TYPES as t (t.code)}
							<option value={t.code}>{t.label}</option>
						{/each}
					</select>
					{#if field.type === 'relation'}
						<select
							value={field.relationTargetEntityId ?? ''}
							onchange={(e) =>
								store.updateField(field.id, 'relationTargetEntityId', e.currentTarget.value || null)}
							class="min-w-32 flex-1 rounded border border-line bg-surface px-1.5 py-1 text-[10px] {field.relationTargetEntityId
								? 'text-ink-600'
								: 'text-danger-500'}"
						>
							<option value="">→ target…</option>
							{#each otherEntities as t (t.id)}
								<option value={t.id}>{t.name || 'table'}</option>
							{/each}
						</select>
					{:else}
						<input
							value={field.defaultValue}
							oninput={(e) => store.updateField(field.id, 'defaultValue', e.currentTarget.value)}
							placeholder="default"
							class="min-w-24 flex-1 rounded border border-line bg-surface px-1.5 py-1 font-mono text-[10px] text-ink-500 outline-none focus:border-brand-300"
						/>
					{/if}
					<button
						type="button"
						onclick={() => store.addNestedField(field.id)}
						class="rounded border border-dashed border-line px-1.5 py-1 text-[10px] font-semibold text-ink-400 hover:border-brand-300 hover:text-brand-600"
						title="Add nested field"
					>
						<Icon name="plus" size={11} /> child
					</button>
					<button
						type="button"
						onclick={() => store.removeField(field.id)}
						class="text-ink-300 hover:text-danger-500"
						title={children.length > 0 ? 'Delete field and nested fields' : 'Delete field'}
					><Icon name="x" size={12} /></button>
				</div>
				<div class="mt-1 flex flex-wrap items-center gap-2.5 pl-1 text-[10px] text-ink-400">
					<label class="flex items-center gap-1">
						<input type="checkbox" checked={field.isId} onchange={() => store.updateField(field.id, 'isId', !field.isId)} /> id
					</label>
					<label class="flex items-center gap-1">
						<input type="checkbox" checked={field.isUnique} onchange={() => store.updateField(field.id, 'isUnique', !field.isUnique)} /> unique
					</label>
					<label class="flex items-center gap-1">
						<input type="checkbox" checked={field.isRequired} onchange={() => store.updateField(field.id, 'isRequired', !field.isRequired)} /> required
					</label>
					<label class="flex items-center gap-1">
						<input type="checkbox" checked={field.isList} onchange={() => store.updateField(field.id, 'isList', !field.isList)} /> list
					</label>
					{#if children.length > 0}
						<span class="rounded-pill bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-600">
							{children.length} nested
						</span>
					{/if}
				</div>
			</div>
			{#if children.length > 0}
				<div class="mt-1.5 space-y-1.5">
					{#each children as child (child.id)}
						{@render fieldRow(child, depth + 1)}
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}
{/if}
