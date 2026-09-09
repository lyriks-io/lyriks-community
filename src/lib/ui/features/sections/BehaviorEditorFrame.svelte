<script lang="ts">
	/**
	 * The behavior editor, framed inside Lyriks and opened on THIS project.
	 *
	 * The URL carries `embed=1` (see unspa-dashboard-url), so the editor drops its
	 * own header and banners: the user stays inside one Lyriks page instead of
	 * looking at a second application nested in a panel.
	 */
	import { browser } from '$app/environment';
	import { Icon } from '$ui/design-system';
	import { unspaDashboardBase, unspaDashboardHref, unspaEmbedHref } from '../unspa-dashboard-url';

	interface Props {
		/** The project as the behavior editor knows it (same id as this project). */
		dashboardProjectId: string | null;
		/** Editor route to open (e.g. a feature deep link); null = the project itself. */
		requestedPath?: string | null;
	}
	let { dashboardProjectId, requestedPath = null }: Props = $props();

	const editorBase = $derived(unspaDashboardBase());
	// Land on the requested route when the overview asked for one (a feature
	// deep link), else on the project itself, else on the editor's home.
	const path = $derived(
		requestedPath ??
			(dashboardProjectId ? `/projects/${encodeURIComponent(dashboardProjectId)}` : '/')
	);

	// Frame it only when the browser will send this app's session to the editor.
	// It has no login of its own: it verifies this app's session cookie, and
	// browsers scope cookies by host while ignoring the port. Same host on
	// another port receives the session and frames cleanly. A CHILD subdomain of
	// this host does too, on the hostname-routed layout (e.g. behind a Cloudflare
	// Tunnel, which cannot publish extra ports): there the deployment widens the
	// cookie to this host via LYRIKS_COOKIE_DOMAIN, which the installer sets
	// together with that URL. Any other host receives nothing, and an iframe
	// there would render a "not signed in" page inside a panel that just looks
	// broken.
	const framed = $derived.by(() => {
		const base = editorBase;
		if (!base || !browser) return null;
		// A path base ('/behavior') means THIS app proxies the editor on its own
		// origin (unspa-proxy.server.ts): same-origin by construction, so it
		// always frames and the session question does not arise.
		if (base.startsWith('/')) return unspaEmbedHref(path, base);
		try {
			const editorHost = new URL(base).hostname;
			const sharesSession =
				editorHost === location.hostname || editorHost.endsWith(`.${location.hostname}`);
			return sharesSession ? unspaEmbedHref(path, base) : null;
		} catch {
			return null;
		}
	});

	const externalHref = $derived(unspaDashboardHref(path, editorBase) ?? editorBase);
</script>

{#if framed}
	<!-- Height is set explicitly: the editor is a full application, and an iframe
	     has no intrinsic height, so without this it collapses to a few hundred
	     pixels and the canvas inside is unusable. -->
	<iframe
		src={framed}
		title="Behavior editor"
		class="h-[calc(100vh-20rem)] min-h-125 w-full rounded-card border border-line bg-surface"
	></iframe>
{:else}
	<!-- Not framable: the editor authenticates by verifying THIS app's session
	     cookie, and browsers scope cookies by host. On another host it never
	     receives one, so a frame would show only "not signed in". Send the user
	     out instead of embedding a dead panel. -->
	<div class="space-y-3 rounded-card border border-line bg-surface p-6">
		<p class="text-sm text-ink-700">
			The behavior editor runs on a different host from this app, so it cannot be shown here: it
			signs you in with this app's session, and a browser will not send that session to another
			host.
		</p>
		{#if externalHref}
			<a
				href={externalHref}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1 rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
			>
				Open the behavior editor <Icon name="external-link" size={13} />
			</a>
		{/if}
		<p class="text-xs text-ink-500">
			Serving it on this app's host (its own port), or on a child subdomain of it, embeds it here
			and drops the second sign-in.
		</p>
	</div>
{/if}
