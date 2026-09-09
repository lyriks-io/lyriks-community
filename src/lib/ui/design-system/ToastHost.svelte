<script lang="ts">
	import type { ToastLevel } from '$application/ports';
	import Button from './Button.svelte';
	import IconButton from './IconButton.svelte';
	import Icon, { type IconName } from './Icon.svelte';
	import { toasts, dismissToast, type Toast } from './toast.svelte';

	const stack = $derived(toasts());

	// Token-backed accent per level, mirroring the design-system tone ramps.
	const icon: Record<ToastLevel, IconName> = {
		info: 'info',
		warn: 'flag',
		error: 'bolt'
	};
	const accent: Record<ToastLevel, string> = {
		info: 'text-info-500',
		warn: 'text-warning-500',
		error: 'text-danger-500'
	};

	function runAction(t: Toast) {
		t.action?.run();
		dismissToast(t.id);
	}
</script>

{#if stack.length}
	<div class="pointer-events-none fixed bottom-3 right-3 z-50 flex w-full max-w-sm flex-col gap-2">
		{#each stack as t (t.id)}
			<div
				role={t.level === 'error' ? 'alert' : 'status'}
				aria-live={t.level === 'error' ? 'assertive' : 'polite'}
				class="pointer-events-auto flex items-start gap-2.5 rounded-card border border-line bg-surface p-3 shadow-pop"
			>
				<Icon name={icon[t.level]} size={16} class="mt-0.5 shrink-0 {accent[t.level]}" />
				<p class="min-w-0 flex-1 text-xs leading-snug text-ink-700">{t.message}</p>
				{#if t.action}
					<Button variant="outline" size="sm" onclick={() => runAction(t)}>{t.action.label}</Button>
				{/if}
				<IconButton name="x" label="Dismiss" onclick={() => dismissToast(t.id)} />
			</div>
		{/each}
	</div>
{/if}
