<script lang="ts">
	import { page } from '$app/state';
	import { Icon, Logo } from '$ui/design-system';

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? 'Project not found' : 'Something went wrong');
	const detail = $derived(
		notFound
			? "Project not found or you don't have access to it."
			: (page.error?.message ?? 'An unexpected error occurred.')
	);
</script>

<div class="grid min-h-[60vh] place-items-center bg-canvas px-4">
	<div class="w-full max-w-sm text-center">
		<Logo size={44} class="mx-auto mb-3" />
		<p class="text-xs font-semibold uppercase tracking-wide text-ink-400">{page.status}</p>
		<h1 class="mt-1 text-lg font-bold text-ink-900">{title}</h1>
		<p class="mt-2 text-sm text-ink-400">{detail}</p>
		<a
			href="/"
			class="mt-6 inline-flex items-center gap-2 rounded-field bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-card transition-opacity hover:opacity-95"
		>
			<Icon name="arrow-left" size={16} />
			Back to home
		</a>
	</div>
</div>
