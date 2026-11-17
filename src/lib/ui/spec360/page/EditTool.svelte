<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { useEditMode } from '../edit-mode.svelte';
	import { useEdits } from '../edits.svelte';
	import { leaveEdit, leaveLabel } from '../leave-edit';
	import { PRIMARY, TOOL, TOOL_ON } from './tools';

	/**
	 * Edit, in the page's head: turns the Edit mode on (also Ctrl/Cmd+E); shown only to who may edit. On, it says what
	 * a click does: Stop editing, or Cancel editing once a text changed, Save with how many changes wait at its right,
	 * which leaves the mode once every change is written
	 * (criterion 41514698). No Discard: Cancel editing drops the changes, after asking.
	 */
	const mode = useEditMode();
	const edits = useEdits();
	const held = $derived(mode.active ? edits.stagedCount : 0);
	let saving = $state(false);

	async function save() {
		saving = true;
		// Every change written, the page reads clean again; one refused keeps the mode on with it (criterion 41514698).
		if (await edits.saveStaged()) mode.set(false);
		saving = false;
	}
</script>

{#if mode.available}
	<button
		type="button"
		class="{TOOL} {mode.active ? TOOL_ON : ''}"
		disabled={saving}
		title={!mode.active ? 'Edit this page (Ctrl+E)' : held > 0 ? 'Drop your changes and leave the Edit mode (Ctrl+E)' : 'Leave the Edit mode (Ctrl+E)'}
		onclick={() => (mode.active ? void leaveEdit(mode, edits) : mode.set(true))}
	>
		<Icon name="pencil" size={13} />{mode.active ? leaveLabel(edits) : 'Edit'}
	</button>
	{#if held > 0}
		<button type="button" class="{PRIMARY} h-[30px] px-3 animate-lk-in-fast" disabled={saving} onclick={() => void save()}>
			Save{held > 1 ? ` (${held})` : ''}
		</button>
	{/if}
{/if}
