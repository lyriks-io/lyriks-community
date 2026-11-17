<script lang="ts">
	import { page } from '$app/state';
	import { dismissable } from './dismissable';
	import { openFeedback } from './feedback.svelte';
	import type { FirstStep } from './first-steps-guide';
	import { HELP_LINKS } from './help-links';
	import FirstStepsDialog from './FirstStepsDialog.svelte';
	import SideIcon from './SideIcon.svelte';

	// Help & support at the foot of the navigation (criterion 81cc595c), opening
	// upward: the first steps with how many are done (in the app, with the full
	// guide one link away, action b4068a45), the documentation, the feedback
	// dialog (Leave us feedback, as the Documentation names it, criterion
	// e3629a5f), and the community and a demo once the installation knows their
	// addresses. An outside link opens in a new tab, on a click only, and is
	// drawn only where an administrator allowed it (criterion b4538030).
	let { steps }: { steps: FirstStep[] } = $props();

	const discord = $derived(page.data.onlineHelp ? HELP_LINKS.discord : null);
	const demo = $derived(page.data.onlineHelp ? HELP_LINKS.demo : null);

	let open = $state(false);
	let showSteps = $state(false);
	const done = $derived(steps.filter((s) => s.done).length);

	function openSteps() {
		open = false;
		showSteps = true;
	}

	function feedback() {
		open = false;
		openFeedback();
	}
</script>

<div class="fw" {@attach dismissable(() => (open = false))}>
	{#if open}
		<div class="fm" role="menu" aria-label="Help and support">
			<button type="button" role="menuitem" onclick={openSteps}><SideIcon name="flag" /><span class="mt">First steps</span><span class="mx">{done} / {steps.length}</span></button>
			<a href="/documentation" role="menuitem" onclick={() => (open = false)}><SideIcon name="docs" /><span class="mt">Documentation</span></a>
			{#if discord}
				<a href={discord} target="_blank" rel="noopener noreferrer" role="menuitem" onclick={() => (open = false)}>
					<SideIcon name="chat" /><span class="mt">Community on Discord</span><span class="mx"><SideIcon name="external" size={13} /></span>
				</a>
			{/if}
			<button type="button" role="menuitem" onclick={feedback}><SideIcon name="feedback" /><span class="mt">Leave us feedback</span></button>
			{#if demo}
				<a href={demo} target="_blank" rel="noopener noreferrer" role="menuitem" onclick={() => (open = false)}>
					<SideIcon name="calendar" /><span class="mt">Book a demo</span><span class="mx"><SideIcon name="external" size={13} /></span>
				</a>
			{/if}
		</div>
	{/if}
	<button type="button" class="si fb" aria-haspopup="menu" aria-expanded={open} data-tip="Help & support" onclick={() => (open = !open)}>
		<span class="lab"><SideIcon name="help" /><span class="txt">Help &amp; support</span></span>
		<SideIcon name="up" size={14} class="menu-cv" />
	</button>
</div>

{#if showSteps}
	<FirstStepsDialog {steps} onClose={() => (showSteps = false)} />
{/if}
