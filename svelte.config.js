import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'base-uri': ['self'],
				'connect-src': ['self', 'ws:', 'wss:'],
				'font-src': ['self', 'data:'],
				'frame-src': ['self', 'blob:'],
				'img-src': ['self', 'data:', 'blob:'],
				'manifest-src': ['self'],
				'media-src': ['self', 'data:', 'blob:'],
				'object-src': ['none'],
				'script-src': ['self'],
				'script-src-attr': ['none'],
				'style-src': ['self', 'unsafe-inline'],
				'worker-src': ['self', 'blob:'],
				// 'self' plus the loopback callbacks the MCP login has to end on.
				//
				// form-action is enforced across the whole redirect chain a form
				// submission triggers, not just its immediate action. Signing in for an
				// AI client POSTs to /login, which redirects to /mcp/oauth/authorize,
				// which redirects to the client's callback on 127.0.0.1:<random port> —
				// so the browser blocked the sign-in outright, at the last hop, with a
				// CSP error naming a same-origin URL. Nothing about the message points
				// at the loopback address that actually tripped it.
				//
				// This is not a loosening in practice: /mcp/oauth/authorize already
				// refuses any redirect_uri that is neither registered by the client nor
				// loopback (RFC 8252 native-app flow), and it validates that BEFORE it
				// can ever redirect. The policy was simply stricter than the flow the
				// product ships, so it forbade the one destination the server permits.
				'form-action': ['self', 'http://localhost:*', 'http://127.0.0.1:*'],
				'frame-ancestors': ['none']
			}
		},
		// On-prem LAN appliance: reached by many hosts/ports (http://lyriks,
		// http://<ip>:8080, …) with no fixed origin known at build time. SvelteKit's
		// default cross-origin POST guard would 403 every create-domain/create-project
		// form unless ORIGIN exactly matches the access URL — impossible to pin for an
		// appliance handed to unknown networks. Disable it; this matches the product's
		// trust model (auth is off by default for a trusted VLAN install). The
		// runtime hook still enforces same-origin writes against each request's
		// actual origin, so unknown appliance hostnames remain protected.
		// `trustedOrigins: ['*']` is the supported replacement for the deprecated
		// `checkOrigin: false` — SvelteKit skips the guard when '*' is trusted.
		csrf: { trustedOrigins: ['*'] },
		alias: {
			$domain: 'src/lib/domain',
			'$domain/*': 'src/lib/domain/*',
			$application: 'src/lib/application',
			'$application/*': 'src/lib/application/*',
			$infrastructure: 'src/lib/infrastructure',
			'$infrastructure/*': 'src/lib/infrastructure/*',
			$composition: 'src/lib/composition',
			'$composition/*': 'src/lib/composition/*',
			$ui: 'src/lib/ui',
			'$ui/*': 'src/lib/ui/*'
		}
	}
};

export default config;
