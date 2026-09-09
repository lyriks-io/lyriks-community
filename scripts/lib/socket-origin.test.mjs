import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustedSocketOrigin } from './socket-origin.mjs';
const request = origin => ({ headers: { origin, host: 'studio.example', 'x-forwarded-proto': 'https' } });
test('only the application origin opens a browser socket', () => {
	assert.equal(trustedSocketOrigin(request('https://studio.example'), {}), true);
	for (const origin of [undefined, 'null', 'https://evil.example', 'https://evil.studio.example', 'http://studio.example', 'https://studio.example/path']) {
		assert.equal(trustedSocketOrigin(request(origin), {}), false);
	}
});
test('an explicit origin or allowlist overrides untrusted host headers', () => {
	assert.equal(trustedSocketOrigin(request('https://evil.example'), { ORIGIN: 'https://studio.example' }), false);
	assert.equal(trustedSocketOrigin(request('https://second.example'), { LYRIKS_TRUSTED_ORIGINS: 'https://studio.example,https://second.example' }), true);
});
