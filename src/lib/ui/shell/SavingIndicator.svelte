<script lang="ts">
	import { pendingSaves } from './pending-saves.svelte';

	// What the person did and the page already shows is still on its way to the
	// server: say so until it is confirmed (criterion 27bbfacd), so a slow save
	// never reads as a lost one.
	const waiting = $derived(pendingSaves.waiting);
	const saved = $derived(pendingSaves.justSaved);
</script>

{#if waiting > 0 || saved}
	<div class="saving" role="status" aria-live="polite">
		{#if waiting > 0}
			<span class="dot" aria-hidden="true"></span>Saving{waiting > 1 ? ` (${waiting})` : ''}…
		{:else}
			Saved
		{/if}
	</div>
{/if}

<style>
	.saving {
		position: fixed;
		top: 10px;
		right: 16px;
		z-index: 1001;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-ink-700, #333);
		background: var(--color-toner-2, #f1f1f1);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
		pointer-events: none;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-blue, #2a6df4);
		animation: saving-pulse 1s ease-in-out infinite;
	}
	@keyframes saving-pulse {
		50% {
			opacity: 0.3;
		}
	}
</style>
