<script lang="ts">
	import { untrack } from 'svelte';
	import { requirementCandidates, suggestionPlaceOf, pointsOf, type FieldThreadMessage } from '$domain/evolution';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { requirementKindOf, requirementLanguage } from './requirement-kinds';
	import MentionText from './MentionText.svelte';
	import { LLM_BADGE, SUGGESTED } from './evo-look';
	import { personName } from './people';

	let { projectId, requestId, fields, paths, canEdit, lang, mentionLinks, members = [] } : {
		projectId: string; requestId: string;
		fields: readonly { readonly path: string; readonly value: string; readonly thread?: { readonly messages: readonly FieldThreadMessage[] } | null }[];
		paths: readonly string[];
		members?: readonly { id: string; name: string }[];
		canEdit: boolean; lang: string; mentionLinks: Readonly<Record<string, { readonly href: string | null }>>;
	} = $props();
	const writes = useEvolutionWrites(untrack(() => projectId));
	let pending = $state<string[]>([]);
	const messages = $derived([...new Map(fields.flatMap((f) => f.thread?.messages ?? []).map((m) => [m.id, m])).values()] as FieldThreadMessage[]);
	const rows = $derived(requirementCandidates(messages).filter((c) => paths.includes(c.fieldPath) &&
		(c.state === 'refused' || !pointsOf(fields.find((f) => f.path === c.fieldPath)?.value ?? '').includes(c.line))));
	const kindOf = (path: string) => {
		const place = suggestionPlaceOf(path);
		return place ? requirementKindOf(requirementLanguage(lang), place.step, place.kind === 'description' ? 'description' : place.key) : '';
	};
	async function decide(row: (typeof rows)[number], decision: 'accept' | 'refuse') {
		if (!canEdit || pending.includes(row.key) || row.state !== 'waiting') return;
		pending = [...pending, row.key];
		try {
			await writes.send({}, [{ op: 'decide_thread_suggestion', requestId, messageId: row.messageId, fieldPath: row.fieldPath, line: row.line, decision }], decision === 'accept' ? 'the requirement accepted' : 'the requirement rejected');
		} finally { pending = pending.filter((key) => key !== row.key); }
	}
</script>

{#if rows.length > 0}
	<div class="flex flex-col gap-2" aria-label="Proposed requirements">
		{#each rows as row (row.key)}
			<div class="flex flex-wrap items-center gap-3 rounded-lg px-2.5 py-2 {SUGGESTED}" data-requirement-state={row.state}>
				<span class={LLM_BADGE}>AI</span>
				<span class="text-xs text-evo-muted">{personName(row.author, members)}</span>
				<span class="bg-toner-2 px-2 py-1 font-evo-mono text-xs font-bold uppercase">{kindOf(row.fieldPath)}</span>
				<span class="min-w-0 flex-[1_1_320px] {row.state === 'refused' ? 'line-through opacity-60' : ''}"><MentionText text={row.line} links={mentionLinks} /></span>
				{#if pending.includes(row.key)}
					<span role="status" class="text-xs text-evo-muted">Saving…</span>
				{:else if row.state === 'waiting' && canEdit}
					<button type="button" class="inline-flex h-7 min-h-7 items-center rounded-lg border border-blue bg-blue px-2.5 text-xs font-semibold text-white disabled:opacity-50" aria-label="Accept requirement: {row.line}" onclick={() => void decide(row, 'accept')}>Accept</button>
					<button type="button" class="inline-flex h-7 min-h-7 items-center rounded-lg border border-evo-line px-2.5 text-xs font-semibold text-evo-ink disabled:opacity-50" aria-label="Reject requirement: {row.line}" onclick={() => void decide(row, 'refuse')}>Reject</button>
				{:else}
					<span role="status" class="text-xs text-evo-muted">{row.state === 'accepted' ? 'Accepted' : row.state === 'refused' ? `Rejected${row.by ? ` by ${personName(row.by, members)}` : ''}` : 'Awaiting a reviewer'}</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}
