<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon, pushToast } from '$ui/design-system';

	/**
	 * A project Community holds inactive (EVO-001), as the error page renders its
	 * refusal: the sentence, the plans that open every project again, and the
	 * one way in, making it the active project (the one active before becomes
	 * inactive).
	 */
	let { projectId, message, detail }: { projectId: string; message: string; detail?: string } = $props();

	let busy = $state(false);

	async function makeActive() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/active-project', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ projectId })
			}).catch(() => null);
			if (!res?.ok) {
				pushToast({ level: 'error', message: 'The project was not made active. Try again.' });
				return;
			}
			await goto(page.url.href, { invalidateAll: true, replaceState: true });
		} finally {
			busy = false;
		}
	}
</script>

<p class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">Inactive project</p>
<h1 class="mt-1.5 text-[1.375rem] font-bold tracking-[-0.02em] text-ink">This project is inactive</h1>
<p class="mt-2 text-[0.9375rem] text-ink-2">{message}</p>
{#if detail}<p class="mt-1 text-[0.8125rem] text-ink-3">{detail}</p>{/if}
<div class="mt-6 flex flex-wrap items-center justify-center gap-3">
	<button
		type="button"
		aria-disabled={busy}
		onclick={makeActive}
		class="pressable inline-flex min-h-10 cursor-pointer items-center gap-2 border-[1.5px] border-ink bg-evo-violet px-4 text-xs font-bold tracking-[0.07em] text-paper uppercase"
	>
		<Icon name="check" size={16} />
		Make it the active project
	</button>
	<a href="/" class="text-xs font-semibold text-ink underline decoration-[1.5px] underline-offset-[5px]">Back to home</a>
</div>
