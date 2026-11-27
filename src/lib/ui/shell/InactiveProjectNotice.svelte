<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon, pushToast } from '$ui/design-system';
	import SetAsideProjectDialog from './SetAsideProjectDialog.svelte';

	/**
	 * A project held inactive (EVO-001 on Community, EVO-016 where the key grants
	 * N projects), as the error page renders its refusal: the sentence, what
	 * opens every project again, and the one way in, making it active. With one
	 * active project it is set aside without asking; with several, every place
	 * taken, the person picks the one that makes room (criterion 601e615e).
	 */
	let { projectId, message, detail, granted }: { projectId: string; message: string; detail?: string; granted?: number } = $props();

	let busy = $state(false);
	let choosing = $state<readonly { readonly id: string; readonly name: string }[] | null>(null);

	async function makeActive(setAsideProjectId?: string) {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/active-project', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ projectId, setAsideProjectId })
			}).catch(() => null);
			if (res?.status === 409) {
				const body = (await res.json().catch(() => null)) as { reason?: string; activeProjects?: { id: string; name: string }[] } | null;
				if (body?.reason === 'choose_set_aside' && body.activeProjects?.length) return void (choosing = body.activeProjects);
			}
			if (!res?.ok) {
				pushToast({ level: 'error', message: 'The project was not made active. Try again.' });
				return;
			}
			choosing = null;
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
		onclick={() => makeActive()}
		class="pressable inline-flex min-h-10 cursor-pointer items-center gap-2 border-[1.5px] border-ink bg-evo-violet px-4 text-xs font-bold tracking-[0.07em] text-paper uppercase"
	>
		<Icon name="check" size={16} />
		{granted && granted > 1 ? 'Make it an active project' : 'Make it the active project'}
	</button>
	<a href="/" class="text-xs font-semibold text-ink underline decoration-[1.5px] underline-offset-[5px]">Back to home</a>
</div>
{#if choosing}
	<SetAsideProjectDialog activeProjects={choosing} {busy} onpick={(id) => makeActive(id)} oncancel={() => (choosing = null)} />
{/if}
