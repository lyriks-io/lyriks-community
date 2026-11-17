<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { initials } from '$ui/team/team-style';

	/**
	 * A person in the design's square badge (.ly-avatar) with their initials, or a sparkle for an AI
	 * client (ac-evo-fthread-look, ac-evo-form-validators). Named on hover when
	 * a title is given, decorative otherwise.
	 */
	interface Props {
		name: string;
		ai?: boolean;
		/** 'validated' reads in the green of what holds; 'person' on the neutral toner-2. */
		tone?: 'person' | 'validated';
		title?: string;
		class?: string;
	}
	let { name, ai = false, tone = 'person', title, class: extra = '' }: Props = $props();

	// An AI client speaks in the LLM's violet; a person sits on toner-2, in green once they validated.
	const look = $derived(ai ? 'bg-violet-ink text-paper' : tone === 'validated' ? 'bg-green text-ink' : 'bg-toner-2 text-ink');
</script>

<span
	class="grid size-7 shrink-0 place-items-center font-evo-mono text-[0.625rem] font-bold {look} {extra}"
	title={title}
	aria-label={title}
	aria-hidden={title ? undefined : 'true'}
	role={title ? 'img' : undefined}
>
	{#if ai}<Icon name="sparkles" size={13} />{:else}{initials(name)}{/if}
</span>
