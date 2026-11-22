<script lang="ts">
	import type { SectionWait } from './section-wait';

	/**
	 * In place of a section's content while it has nothing to show yet
	 * (criterion 6213ef4c): why it is empty, in one or two short sentences, and
	 * the one step that fills it. Without a title it sits under a head that
	 * already names the section (Mismatch, EVO-014).
	 */
	let { title, wait }: { title?: string; wait: SectionWait } = $props();
</script>

<section class="wait animate-lk-in" aria-labelledby={title ? 'section-wait-title' : undefined} data-section-wait>
	{#if title}<h1 id="section-wait-title">{title}</h1>{/if}
	{#each wait.lines as line, i (i)}<p class:lead={i === 0}>{line}</p>{/each}
	<a class="step" href={wait.step.href}>{wait.step.label}</a>
</section>

<style>
	.wait {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		max-width: 640px;
		margin: 24px 0;
		padding: 26px 28px;
		border: 1px solid var(--color-line);
		background: var(--color-paper);
		color: var(--color-ink);
	}
	h1 {
		margin: 0 0 4px;
		font: 700 1.625rem/1.05 var(--font-evo);
		letter-spacing: -0.02em;
	}
	p {
		margin: 0;
		color: var(--color-ink-2);
		font: 400 0.9375rem/1.55 var(--font-evo);
	}
	p.lead {
		color: var(--color-ink);
	}
	.step {
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		margin-top: 8px;
		padding: 0 14px;
		border: 1.5px solid var(--color-ink);
		background: var(--color-paper);
		box-shadow: 3px 3px 0 var(--color-ink);
		color: var(--color-ink);
		font: 700 0.71875rem/1 var(--font-evo);
		letter-spacing: 0.05em;
		text-decoration: none;
		text-transform: uppercase;
	}
	.step:hover {
		background: var(--color-toner);
		color: var(--color-ink);
	}
</style>
