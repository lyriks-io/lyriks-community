<script lang="ts">
	import { Icon } from '$ui/design-system';

	/**
	 * The cross that refuses an item of a request's Specification, beside its people's boxes, as the cross of an
	 * element of Knowledge (criteria c035755f, 7c214ba8, 916e2ee4): outlined while offered, filled orange once refused.
	 * A refused item that can be restored keeps the filled cross as its way back; one that cannot reads it only.
	 */
	interface Props {
		/** What the item is called, for its accessible name. */
		name: string;
		/** Refused already: the cross reads filled. */
		rejected?: boolean;
		/** Why a click refuses it, said on hover. */
		title: string;
		/** Refuses the item, or restores it once refused. */
		onclick: (() => void) | null;
		/** What restoring it says on hover; without it a refused cross does nothing. */
		restoreTitle?: string;
		/** The act a click on the refused cross names: Restore by default, Take back the rejection of on Mismatch. */
		restoreWord?: string;
		/** The cross opens what the refusal asks (a form, a brief): whether it is open. */
		expanded?: boolean;
		disabled?: boolean;
	}
	let { name, rejected = false, title, onclick, restoreTitle, restoreWord = 'Restore', expanded, disabled = false }: Props = $props();
	const SQUARE = 'grid size-7 flex-none place-items-center border-[1.5px] border-ink transition-colors duration-200';
</script>

{#if rejected && !restoreTitle}
	<span class="{SQUARE} bg-orange text-ink" role="img" aria-label="Rejected: {name}" title="Rejected" data-reject-state="rejected"><Icon name="x" size={14} /></span>
{:else if rejected}
	<button type="button" class="{SQUARE} cursor-pointer bg-orange text-ink hover:bg-paper disabled:cursor-default" aria-label="{restoreWord} {name}" title={restoreTitle} data-reject-state="rejected" {disabled} onclick={() => onclick?.()}>
		<Icon name="x" size={14} />
	</button>
{:else}
	<button type="button" class="{SQUARE} cursor-pointer bg-paper text-ink hover:bg-red-tint hover:text-red-ink disabled:cursor-default" aria-label="Reject {name}" {title} aria-expanded={expanded} data-reject-state="offered" {disabled} onclick={() => onclick?.()}>
		<Icon name="x" size={14} />
	</button>
{/if}
