<script lang="ts">
	import { Button, Select, TextInput, Textarea } from '$ui/design-system';
	import type { IconName } from '$ui/design-system/Icon.svelte';
	import { applyEvolution } from './reading-api';
	import AddMenu from './uml/AddMenu.svelte';

	/**
	 * Open a subject on the request from the page, exactly as an AI client does
	 * through the MCP (ac-evo-draft-subject-1): a new feature by its name and one
	 * sentence, an existing feature to amend with what changes, or an existing
	 * feature to remove, from one Add a feature menu. Nothing is written into the
	 * tree before the freeze.
	 */
	interface Props {
		projectId: string;
		requestId: string;
		/** The features of the tree a subject may amend or remove. */
		leaves: readonly { id: string; name: string }[];
		/** The features the request already touches, so the same one is not offered twice. */
		touched: readonly string[];
	}
	let { projectId, requestId, leaves, touched }: Props = $props();

	type Kind = 'add' | 'amend' | 'remove';
	let kind = $state<Kind | null>(null);
	let name = $state('');
	let description = $state('');
	let baseLeafId = $state('');
	let busy = $state(false);

	const KINDS: { kind: Kind; label: string; icon: IconName }[] = [
		{ kind: 'add', label: 'New feature', icon: 'plus' },
		{ kind: 'amend', label: 'Change a feature', icon: 'pencil' },
		{ kind: 'remove', label: 'Remove a feature', icon: 'minus' }
	];
	const leafOptions = $derived([
		{ code: '', label: 'Which feature?' },
		...leaves.filter((l) => !touched.includes(l.id)).map((l) => ({ code: l.id, label: l.name }))
	]);
	const ready = $derived(kind === 'add' ? name.trim() !== '' : baseLeafId !== '');

	function reset() {
		kind = null;
		name = '';
		description = '';
		baseLeafId = '';
	}

	async function add() {
		if (!kind || !ready) return;
		busy = true;
		try {
			const op =
				kind === 'add'
					? { op: 'add_draft_leaf', kind, name: name.trim(), description: description.trim() }
					: { op: 'add_draft_leaf', kind, baseLeafId, ...(description.trim() ? { changeSummary: description.trim() } : {}) };
			if (await applyEvolution(projectId, [{ requestId, ...op }])) reset();
		} finally {
			busy = false;
		}
	}
</script>

{#if kind === null}
	<AddMenu label="Add a feature" menuLabel="Add a feature the change touches" entries={KINDS.map((k) => ({ label: k.label, icon: k.icon, onSelect: () => (kind = k.kind) }))} />
{:else}
	<div class="space-y-2 rounded-card border-[1.5px] border-ink bg-paper p-3">
		<p class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">{KINDS.find((k) => k.kind === kind)?.label}</p>
		{#if kind === 'add'}
			<TextInput value={name} placeholder="Its name, the way a user would say it" oninput={(v) => (name = v)} />
			<Textarea value={description} rows={2} placeholder="What it lets someone do, in one sentence" oninput={(v) => (description = v)} />
		{:else}
			<Select value={baseLeafId} options={leafOptions} onchange={(v) => (baseLeafId = v)} />
			<Textarea
				value={description}
				rows={2}
				placeholder={kind === 'amend' ? 'What changes in it, in one sentence' : 'Why it goes, in one sentence'}
				oninput={(v) => (description = v)}
			/>
		{/if}
		<div class="flex gap-2">
			<Button size="sm" disabled={busy || !ready} onclick={add}>Add the subject</Button>
			<Button size="sm" variant="ghost" onclick={reset}>Cancel</Button>
		</div>
	</div>
{/if}
