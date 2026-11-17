<script lang="ts">
	import { Button, Icon, Select, TextInput, Textarea } from '$ui/design-system';
	import Mermaid from '$ui/data/board/Mermaid.svelte';
	import { describeDataChange, toChangeErDiagram, type DataChangeView, type DataDraft } from '$domain/evolution';
	import { applyEvolution } from './reading-api';
	import { TONE } from './verdict-tones';

	/**
	 * The data a request changes, drawn like the Data model (ac-evo-imp-erd) and
	 * declared here (ac-evo-draft-data): tables added in blue, changed in amber,
	 * removed in red, each field with its word, and in grey the tables they are
	 * linked to. Nothing of it reaches the Data section before the change is
	 * declared live (ac-evo-draft-data-landing).
	 */
	interface Props {
		projectId: string;
		requestId: string;
		drafts: readonly DataDraft[];
		view: DataChangeView;
		/** The spec can still move: the change can be declared and taken back. */
		canEdit: boolean;
		/** Once live, the changes are in the Data model itself. */
		landed: boolean;
		/** The diagram alone, for the Datamap of the Evolution design, which declares nothing by hand. */
		bare?: boolean;
	}
	let { projectId, requestId, drafts, view, canEdit, landed, bare = false }: Props = $props();

	const code = $derived(toChangeErDiagram(view));
	const c = $derived(view.counts);
	const summary = $derived(
		[
			c.tablesAdded ? `${c.tablesAdded} table${c.tablesAdded === 1 ? '' : 's'} added` : '',
			c.tablesChanged ? `${c.tablesChanged} changed` : '',
			c.tablesRemoved ? `${c.tablesRemoved} removed` : '',
			c.fieldsAdded + c.fieldsChanged + c.fieldsRemoved > 0
				? `fields: ${[c.fieldsAdded ? `${c.fieldsAdded} added` : '', c.fieldsChanged ? `${c.fieldsChanged} changed` : '', c.fieldsRemoved ? `${c.fieldsRemoved} removed` : ''].filter(Boolean).join(', ')}`
				: ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	const live = $derived(drafts.filter((d) => d.materialisedAt === null));

	/* ── The editor: the data model is read when someone opens it ── */
	type Model = { entities: { id: string; name: string }[]; fields: { id: string; entityId: string; name: string; type: string; parentFieldId?: string | null }[] };
	let model = $state<Model | null>(null);
	let editing = $state(false);
	let kind = $state<'add' | 'amend' | 'remove'>('add');
	let tableName = $state('');
	let tableId = $state('');
	let fieldLines = $state('');
	let removing = $state<Record<string, boolean>>({});
	let busy = $state(false);
	async function open() {
		editing = true;
		if (model) return;
		const res = await fetch(`/api/evolution?projectId=${encodeURIComponent(projectId)}&requestId=${encodeURIComponent(requestId)}&part=data`).catch(() => null);
		const body = res?.ok ? ((await res.json()) as { request?: { model?: Model } }) : null;
		model = { entities: body?.request?.model?.entities ?? [], fields: body?.request?.model?.fields ?? [] };
	}
	const tables = $derived([
		...(model?.entities ?? []).map((e) => ({ id: e.id, name: e.name })),
		...live.filter((d) => d.kind === 'add').map((d) => ({ id: d.id, name: d.name }))
	]);
	const touched = $derived(new Set(live.map((d) => d.entityId).filter(Boolean)));
	const fieldsOfTable = $derived((model?.fields ?? []).filter((f) => f.entityId === tableId && !f.parentFieldId));

	/**
	 * One field per line: "name type", then "required" or "list" if it is,
	 * and "-> Table" for a relation. "note string", "client -> Client required".
	 */
	function parseFields(text: string) {
		return text
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
			.map((line) => {
				const [left, target] = line.split('->').map((p) => p.trim());
				const words = left.split(/\s+/);
				const flags = new Set((target ? target.split(/\s+/).slice(1) : []).concat(words.slice(2)).map((w) => w.toLowerCase()));
				const relationName = target ? target.split(/\s+/)[0] : '';
				const relationTo = relationName ? (tables.find((t) => t.name.toLowerCase() === relationName.toLowerCase())?.id ?? relationName) : undefined;
				return {
					name: words[0] ?? '',
					type: relationTo ? 'relation' : (words[1] ?? 'string').toLowerCase(),
					required: flags.has('required'),
					list: flags.has('list'),
					...(relationTo ? { relationTo } : {})
				};
			});
	}

	async function submit() {
		busy = true;
		try {
			const op =
				kind === 'add'
					? { op: 'add_data_draft', kind, name: tableName, addFields: parseFields(fieldLines) }
					: kind === 'amend'
						? { op: 'add_data_draft', kind, entityId: tableId, addFields: parseFields(fieldLines), removeFields: Object.keys(removing).filter((id) => removing[id]) }
						: { op: 'add_data_draft', kind, entityId: tableId };
			if (await applyEvolution(projectId, [{ requestId, ...op }])) {
				editing = false;
				tableName = '';
				tableId = '';
				fieldLines = '';
				removing = {};
			}
		} finally {
			busy = false;
		}
	}
	const takeOut = (id: string) => applyEvolution(projectId, [{ op: 'remove_data_draft', requestId, dataDraftId: id }]);
	const nameOf = (id: string) => tables.find((t) => t.id === id)?.name ?? view.tables.find((t) => t.id === id)?.name ?? id;
	const KIND_TONE = { add: 'todo', amend: 'decide', remove: 'blocks' } as const;
</script>

{#if bare}
	{#if view.tables.length > 0}
		<Mermaid {code} title="The data the request adds, changes or removes" height="420px" dotted />
	{:else}
		<p class="text-[0.8125rem] text-ink-3 italic">{landed && drafts.some(d => d.materialisedAt !== null) ? 'Written into the Data model when the change went live.' : 'This evolution changes no data.'}</p>
	{/if}
{:else if drafts.length === 0 && view.tables.length === 0 && !editing && !landed}
	<!-- A request that touches no data says so in one line (ac-evo-imp-erd), its way to declare one beside it. -->
	<p class="flex flex-wrap items-center gap-x-2 text-xs text-ink-500 italic" aria-label="Data changes">
		This request changes no data.
		{#if canEdit}<button type="button" class="font-semibold text-blue-ink not-italic hover:underline" onclick={open}>Declare a data change</button>{/if}
	</p>
{:else}
<section class="space-y-3 rounded-card border border-transparent bg-surface px-4 py-3" aria-label="Data changes">
	<header class="flex flex-wrap items-center gap-2">
		<h3 class="font-evo-mono text-xs font-medium tracking-[0.08em] text-ink-500 uppercase">Data changes</h3>
		<span class="text-xs text-ink-700">{landed ? 'Written into the Data model when the change went live.' : summary || 'This request changes no data.'}</span>
		{#if canEdit && !editing}
			<Button size="sm" variant="outline" class="ml-auto" onclick={open}>
				<Icon name="plus" size={12} /> Declare a data change
			</Button>
		{/if}
	</header>

	{#if view.tables.length > 0 && !landed}
		<div class="overflow-hidden rounded-card border border-line">
			<Mermaid {code} title="The data the request adds, changes or removes" height="360px" dotted />
		</div>
		<p class="flex flex-wrap gap-x-3 gap-y-1 font-evo-mono text-[0.6875rem] text-ink-700">
			<span class="flex items-center gap-1"><span class="size-2.5 {TONE.todo.dot}"></span>table or field added</span>
			<span class="flex items-center gap-1"><span class="size-2.5 {TONE.decide.dot}"></span>changed</span>
			<span class="flex items-center gap-1"><span class="size-2.5 {TONE.blocks.dot}"></span>removed</span>
			<span class="flex items-center gap-1"><span class="size-2.5 {TONE.before.dot}"></span>linked table, unchanged (grey)</span>
			<span class="font-evo text-ink-400">Each field that moves says so beside it. Nothing reaches the Data model before the change is declared live.</span>
		</p>
	{/if}

	{#if drafts.length > 0}
		<ul class="space-y-1">
			{#each drafts as d (d.id)}
				{@const look = TONE[KIND_TONE[d.kind]]}
				<li class="flex items-start gap-2 rounded-field border border-line border-l-[6px] px-3 py-1.5 text-xs {look.row}">
					<Icon name={look.icon} size={12} class="mt-0.5 shrink-0 {look.text}" />
					<span class="min-w-0 flex-1 text-ink-800">{describeDataChange(d, nameOf)}</span>
					{#if canEdit && d.materialisedAt === null}
						<button type="button" class="shrink-0 text-ink-400 hover:text-danger-600" title="Take this data change out" aria-label="Take this data change out" onclick={() => takeOut(d.id)}>
							<Icon name="x" size={13} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if editing}
		<div class="space-y-2 rounded-card border-2 border-ink bg-paper p-3">
			<div class="flex flex-wrap items-center gap-2">
				<Select
					value={kind}
					options={[
						{ code: 'add', label: 'Add a table' },
						{ code: 'amend', label: 'Change a table' },
						{ code: 'remove', label: 'Remove a table' }
					]}
					onchange={(v) => (kind = v as typeof kind)}
					class="w-48"
				/>
				{#if kind === 'add'}
					<TextInput value={tableName} placeholder="Table name, e.g. Notification" oninput={(v) => (tableName = v)} class="w-64" />
				{:else}
					<Select
						value={tableId}
						options={[{ code: '', label: model ? 'Which table?' : 'Reading the tables…' }, ...(model?.entities ?? []).filter((e) => !touched.has(e.id)).map((e) => ({ code: e.id, label: e.name }))]}
						onchange={(v) => {
							tableId = v;
							removing = {};
						}}
						class="w-64"
					/>
				{/if}
			</div>
			{#if kind !== 'remove'}
				<Textarea
					value={fieldLines}
					rows={3}
					placeholder={'Fields to add, one per line: name type, then required or list if it is, -> Table for a relation\nnote string\ncustomer -> Customer required'}
					oninput={(v) => (fieldLines = v)}
				/>
			{/if}
			{#if kind === 'amend' && fieldsOfTable.length > 0}
				<div class="text-xs">
					<p class="mb-1 font-evo-mono font-medium tracking-[0.06em] text-ink-500 uppercase">Fields to remove</p>
					<div class="flex flex-wrap gap-x-4 gap-y-1">
						{#each fieldsOfTable as f (f.id)}
							<label class="flex items-center gap-1.5 text-ink-700">
								<input type="checkbox" checked={!!removing[f.id]} onchange={(e) => (removing = { ...removing, [f.id]: e.currentTarget.checked })} />
								{f.name} <span class="font-evo-mono text-ink-400">{f.type}</span>
							</label>
						{/each}
					</div>
				</div>
			{/if}
			<div class="flex gap-2">
				<Button size="sm" disabled={busy || (kind === 'add' ? tableName.trim() === '' : tableId === '')} onclick={submit}>Add to the request</Button>
				<Button size="sm" variant="ghost" onclick={() => (editing = false)}>Cancel</Button>
			</div>
		</div>
	{/if}
</section>
{/if}
