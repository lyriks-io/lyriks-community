<script lang="ts">
	import { anchorDomId } from '$domain/discussions';
	import { userLine } from '$application/spec360/users';
	import BlockControls from '$ui/evolution/BlockControls.svelte';
	import BarRow from '../page/BarRow.svelte';
	import InlineEditor from '../InlineEditor.svelte';
	import UserMark from '../UserMark.svelte';
	import { useEdits } from '../edits.svelte';
	import { useValidation } from '../validation.svelte';
	import { useEditMode } from '../edit-mode.svelte';
	import StagedText from '../StagedText.svelte';
	import RejectAct from '../RejectAct.svelte';

	/**
	 * One user in the list of Users and permissions (criterion 4146848b): its
	 * mark, its name, the first sentence of who it is, the number of actions it
	 * can perform (no bar, criterion 41a9c9d6), its cross and its check while a
	 * draft (criterion a4ef7658) and the comments still open on it, discussed on
	 * its own page; the row opens the
	 * user's page. In the Edit mode the row reads its name and description as
	 * fields, held until Save, the page a click on its chevron away; a user
	 * just added has its name selected for typing over (criterion 41514698).
	 */
	interface Props {
		anchor: string;
		name: string;
		description: string;
		admin: boolean;
		granted: number;
		total: number;
		/** Topics still open on the user and on its actions. */
		openTopics: number;
		href: string;
	}
	let { anchor, name, description, admin, granted, total, openTopics, href }: Props = $props();
	const edits = useEdits();
	const validation = useValidation();
	const validate = $derived(validation.control(anchor));
	const mode = useEditMode();
	const read = $derived({ text: name, desc: description });
</script>

{#snippet reject()}<RejectAct {anchor} title={name} />{/snippet}

<div id={anchorDomId(anchor)} data-evo-waits={validation.waitsOnMe(anchor) || undefined} class="scroll-mt-36 border-t border-evo-line-soft first:border-t-0" title="{granted} of {total} {total === 1 ? 'action' : 'actions'}">
	{#if edits.editing === anchor}
		<div class="px-[18px] py-3"><InlineEditor {anchor} /></div>
	{:else if mode.active}
		<div class="flex items-start gap-3 px-[18px] py-3">
			<UserMark {admin} size={36} />
			<div class="flex min-w-0 flex-1 flex-col gap-1.5">
				<StagedText {anchor} {read} field="text" label="Name" class="text-[0.9375rem] font-semibold text-ink" />
				<StagedText {anchor} {read} field="desc" multiline label="Description" class="text-[0.8125rem] leading-[1.45] text-ink-2" />
			</div>
			{#if validate}<BlockControls icons {validate} {reject} />{/if}
			<a {href} class="grid size-8 flex-none place-items-center text-ink no-underline hover:bg-toner-1" aria-label="Open {name}" title="Open {name}">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
			</a>
		</div>
	{:else}
		<BarRow title={name} desc={userLine(description)} {href} value={granted} unit="action">
			{#snippet lead()}<UserMark {admin} size={36} />{/snippet}
			{#snippet badge()}
				{#if openTopics > 0}
					<span
						class="pointer-events-none inline-flex items-center gap-1 bg-orange px-1.5 font-evo-mono text-xs font-bold text-ink"
						role="img"
						aria-label="{openTopics} open {openTopics === 1 ? 'comment' : 'comments'}"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path></svg>{openTopics}
					</span>
				{/if}
			{/snippet}
			{#snippet controls()}
				{#if validate}<BlockControls icons {validate} {reject} />{/if}
			{/snippet}
		</BarRow>
	{/if}
</div>
