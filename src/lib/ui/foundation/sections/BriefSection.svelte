<script lang="ts">
	import { EditableText, Field, SectionCard } from '$ui/design-system';
	import { validateBrief } from '$domain/foundation';
	import type { IdentityStore } from '../identity-store.svelte';

	interface Props {
		store: IdentityStore;
	}
	let { store }: Props = $props();

	const error = $derived(validateBrief(store.draft.brief)?.message ?? null);
</script>

<SectionCard
	eyebrow="Brief"
	icon="sparkles"
	title="The raw idea"
	subtitle="Write it freely - it anchors the rest of the wizard."
>
	<!-- Inline click-to-edit (the mockup's EditText): reads as prose, tints on hover,
	     turns into an editable textarea on click. Commits on blur. -->
	<Field error={store.draft.brief.length > 0 ? error : null}>
		<EditableText
			multiline
			ariaLabel="Brief"
			value={store.draft.brief}
			onCommit={store.setBrief}
			placeholder="What problem are we solving, for whom, and why now? Mention competitors, payment methods, compliance, target customers…"
			class="block whitespace-pre-wrap text-sm leading-relaxed text-ink-700"
		/>
	</Field>
</SectionCard>
