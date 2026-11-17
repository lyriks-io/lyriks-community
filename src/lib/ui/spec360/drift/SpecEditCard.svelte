<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { pushToast } from '$ui/design-system';
	import { copyPrompt } from '$ui/evolution/copy-prompt';
	import { clientId } from '$ui/shell/live-sync.client';
	import { timeAgo } from '$ui/shell/notification-view';
	import { refusalOf } from '$ui/shell/save-queue';
	import { RETROSPEC_SECTION } from '$domain/retrospec';
	import type { SpecEditView } from '$lib/shared/code-drift-page';
	import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
	import { BTN, BTN_MAIN, LABEL, LINK } from '../page/look';

	/**
	 * One change made by hand in the validated specification (criteria 68b978c4,
	 * 0873e142, fea8666f): what the element read before the first edit beside
	 * what it reads now, who changed it, then where it stands against the code.
	 * Not read against the code yet, only Cancel the edit is offered; once a
	 * retrospecification read the code and it says otherwise, Keep the
	 * specification copies the brief that makes the code follow it. A line the
	 * code confirms has left the list by then.
	 */
	interface Props {
		projectId: string;
		edit: SpecEditView;
		canWrite: boolean;
	}
	let { projectId, edit, canWrite }: Props = $props();
	let busy = $state(false);

	const STATUS = {
		unchecked: { tag: 'Not checked against the code yet', tone: 'border-orange text-orange-ink' },
		differs: { tag: 'The code says otherwise', tone: 'border-red-ink text-red-ink' },
		kept: { tag: 'Kept · the code must follow', tone: 'border-ink text-ink' },
		confirmed: { tag: 'Confirmed by the code', tone: 'border-green-ink text-green-ink' }
	} as const;
	const status = $derived(STATUS[edit.status]);
	const said = (t: { text: string; desc: string }) => [t.text.trim(), t.desc.trim()].filter(Boolean);

	async function post(url: string, body: unknown, what: string): Promise<boolean> {
		busy = true;
		try {
			const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId }, body: JSON.stringify(body) });
			if (!res.ok) {
				pushToast({ level: 'error', message: `${what} was not saved. ${await refusalOf(res, 'The decision failed')}` });
				return false;
			}
			// Our own write never echoes back on the live stream: read it ourselves.
			await Promise.all([invalidate(sectionSyncKey(projectId, RETROSPEC_SECTION)), invalidate(projectSyncKey(projectId))]);
			return true;
		} catch {
			pushToast({ level: 'error', message: `${what} was not saved. Check your connection.` });
			return false;
		} finally {
			busy = false;
		}
	}

	async function cancel() {
		const ok = await post(`/projects/${encodeURIComponent(projectId)}/spec/edit`, { op: 'cancel_hand_edit', anchor: edit.itemId }, 'Cancelling the edit');
		if (ok) pushToast({ level: 'success', message: 'Edit cancelled: the element reads what it read before' });
	}

	async function keep() {
		const ok = await post(`/projects/${encodeURIComponent(projectId)}/spec/validation`, { acts: [{ op: 'keep_spec_edit', itemId: edit.itemId }] }, 'Keeping the specification');
		if (ok && edit.prompt) await copyPrompt(edit.prompt, 'Specification kept: the brief that makes the code follow it is copied for your AI');
	}
</script>

<section class="mt-4 border-[1.5px] px-5 py-[18px] max-[700px]:px-4 {edit.status === 'kept' ? 'border-ink-3 bg-surface-sunken' : 'border-evo-line bg-surface'}" aria-label={edit.title}>
	<div class="flex flex-wrap items-center gap-2.5">
		<span class="border-[1.5px] px-2 py-[3px] font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] uppercase {status.tone}">{edit.kind} changed in the spec</span>
		{#if edit.featureName && edit.kind === 'Action'}<span class="text-sm text-ink-2">{edit.featureName}</span>{/if}
		<span class="ml-auto font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] uppercase {status.tone.split(' ')[1]}">{status.tag}</span>
	</div>
	<h3 class="m-0 mt-2.5 mb-0.5 text-lg leading-snug font-bold tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">{edit.title}</h3>
	<div class="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-3">
		<span>Changed by {edit.by}, {timeAgo(edit.at)}</span>
		<span aria-hidden="true">·</span>
		<a href={edit.href} class="font-semibold text-blue-ink no-underline hover:underline">See it in the spec</a>
	</div>

	<div class="mt-3.5 grid grid-cols-[minmax(0,1fr)_70px_minmax(0,1fr)] items-stretch max-[700px]:grid-cols-[minmax(0,1fr)]">
		<div class="border-[1.5px] border-l-[6px] border-ink-3 bg-surface-sunken px-3.5 py-3">
			<div class="{LABEL} text-ink-3">Before</div>
			{#each said(edit.before) as line, i (i)}<p class="m-0 mt-1.5 text-[0.9375rem] leading-normal text-ink [overflow-wrap:anywhere]">{line}</p>{/each}
		</div>
		<div class="flex flex-col items-center justify-center font-evo-mono text-xs font-bold text-ink-2 max-[700px]:flex-row max-[700px]:gap-1.5 max-[700px]:py-1.5" aria-hidden="true">
			<svg class="max-[700px]:rotate-90" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14m-6-6 6 6-6 6"></path></svg><span>edit</span>
		</div>
		<div class="border-[1.5px] border-l-[6px] border-green-ink bg-green-tint px-3.5 py-3">
			<div class="{LABEL} text-green-ink">In the spec now</div>
			{#each said(edit.after) as line, i (i)}<p class="m-0 mt-1.5 text-[0.9375rem] leading-normal text-ink [overflow-wrap:anywhere]">{line}</p>{/each}
		</div>
	</div>

	{#if edit.check}
		<div class="mt-2.5 border-[1.5px] border-l-[6px] border-red-ink bg-red-tint px-3.5 py-3">
			<div class="{LABEL} text-red-ink">In the code, read {timeAgo(edit.check.at)}</div>
			<p class="m-0 mt-1.5 font-evo-mono text-[0.8125rem] leading-normal text-ink [overflow-wrap:anywhere]">{edit.check.code || 'The run did not say what it reads.'}</p>
			{#if edit.check.where}<p class="m-0 mt-1 font-evo-mono text-[0.75rem] text-ink-3 break-all">{edit.check.where}</p>{/if}
		</div>
	{/if}

	<div class="mt-3.5 flex flex-wrap items-center gap-1.5">
		{#if edit.status === 'unchecked'}
			<span class="text-[0.8125rem] text-ink-3">The next Reverse-Specification reads the code against it; it is decided then.</span>
		{:else if edit.status === 'kept' && edit.kept}
			<span class="text-[0.8125rem] text-ink-3">Kept by {edit.kept.by}, {timeAgo(edit.kept.at)}: it leaves the list once a Reverse-Specification reads the code as the spec.</span>
		{/if}
		{#if canWrite}
			{#if edit.status === 'differs'}
				<button type="button" class="{BTN_MAIN} max-[700px]:min-h-11" disabled={busy} onclick={() => void keep()}>Keep the specification</button>
			{/if}
			<button type="button" class="{BTN} max-[700px]:min-h-11" disabled={busy} onclick={() => void cancel()}>Cancel the edit</button>
			{#if edit.status === 'kept' && edit.prompt}
				<button type="button" class="{LINK} max-[700px]:min-h-11" onclick={() => void copyPrompt(edit.prompt ?? '', 'Brief copied: paste it in your AI coding tool')}>Copy the brief</button>
			{/if}
		{:else}
			<span class="text-[0.8125rem] text-ink-3">A project editor decides on it.</span>
		{/if}
	</div>
</section>
