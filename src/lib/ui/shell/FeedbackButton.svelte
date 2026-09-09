<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { openFeedback } from './feedback.svelte';

	// Feedback is asked for, not hidden behind a menu: the header carries it
	// next to the avatar so a user who just hit a rough edge reports it there
	// and then, with the invitation spelled out rather than shortened to a
	// label. `FeedbackHost` (root layout) renders the dialog itself.
	//
	// The amber and the turning halo are a TEST-PHASE treatment: while Lyriks is
	// in the hands of its first users, a button nobody notices collects nothing.
	// The colour is the palette's own warm accent (the amber end of
	// `gradient-warm`) rather than a foreign lemon, so it stands out of the bar
	// without stepping out of the brand. Both come out together (the button then
	// wears the avatar's translucent white) once feedback arrives on its own.
</script>

<span class="relative inline-flex shrink-0">
	<span class="aura" aria-hidden="true"></span>
	<button
		type="button"
		onclick={openFeedback}
		title="Tell the Lyriks team what works and what does not"
		class="relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill border border-warning-600/50 bg-warning-300 px-3 text-xs font-semibold text-ink-900 shadow-sm outline-none transition hover:bg-warning-200 focus-visible:ring-2 focus-visible:ring-white"
	>
		<Icon name="pencil" size={14} />
		<span class="hidden sm:inline">Leave us feedback</span>
	</button>
</span>

<style>
	/* The halo turns by animating the gradient's own angle: rotating a
	   pill-shaped element would swing its corners instead of sweeping light
	   around it. Registering the property is what makes an angle animatable;
	   where that is unsupported the halo simply stands still, which is still
	   a halo. */
	@property --aura-angle {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}

	.aura {
		position: absolute;
		inset: -6px;
		border-radius: 9999px;
		background: conic-gradient(
			from var(--aura-angle),
			rgb(252 211 77 / 0) 0deg,
			rgb(252 211 77 / 1) 55deg,
			rgb(255 255 255 / 0.95) 120deg,
			rgb(252 211 77 / 0) 195deg,
			rgb(252 211 77 / 1) 300deg,
			rgb(252 211 77 / 0) 360deg
		);
		filter: blur(7px);
		pointer-events: none;
		animation: aura-turn 3s linear infinite;
	}

	@keyframes aura-turn {
		to {
			--aura-angle: 360deg;
		}
	}

	/* An animation that never stops belongs to whoever wants motion. */
	@media (prefers-reduced-motion: reduce) {
		.aura {
			animation: none;
		}
	}
</style>
