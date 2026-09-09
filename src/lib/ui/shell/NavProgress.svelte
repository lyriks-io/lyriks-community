<script lang="ts">
	import { navigating } from '$app/state';

	// Truthy from the instant a sidebar link is clicked until the target page's
	// `load` resolves and the route commits. SvelteKit keeps the current page on
	// screen while the next one loads (non-blocking), but gives no feedback during
	// that wait — so a heavy page (e.g. the Knowledge graph, whose server load
	// builds the whole merged graph) feels like the click did nothing. This slim
	// top bar is that missing feedback; the keyed fade in the layout then handles
	// the swap once the content is ready. Neutralized under prefers-reduced-motion
	// via the app-wide rule in app.css (the bar stays visible, just doesn't animate).
	const active = $derived(navigating.to !== null);
</script>

{#if active}
	<div class="nav-progress" role="status" aria-label="Loading page">
		<span class="nav-progress__bar"></span>
	</div>
{/if}

<style>
	.nav-progress {
		position: absolute;
		inset: 0 0 auto 0;
		height: 3px;
		overflow: hidden;
		z-index: 30;
		pointer-events: none;
		background: color-mix(in oklab, var(--color-brand-500) 16%, transparent);
	}
	.nav-progress__bar {
		position: absolute;
		inset: 0;
		display: block;
		width: 45%;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			transparent,
			var(--color-brand-400),
			var(--color-brand-500),
			transparent
		);
		animation: nav-progress-slide 1.05s cubic-bezier(0.65, 0, 0.35, 1) infinite;
	}
	@keyframes nav-progress-slide {
		0% {
			transform: translateX(-120%);
		}
		100% {
			transform: translateX(320%);
		}
	}
</style>
