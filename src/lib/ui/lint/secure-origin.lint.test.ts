import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC, appFiles, parsed } from './source-lint';

/**
 * An install served over plain http is not a secure origin: its browser has no
 * `crypto.randomUUID`, and a bare call throws, so the gesture that needed an id
 * (the first arrow of a feature's journeys, a new evolution, an ERD render) was
 * lost without a word. Every id minted outside server-only code goes through
 * `mintUuid` ($domain/shared), which falls back on `crypto.getRandomValues`.
 * Server-only code (`*.server.ts`, `+server.ts`, src/lib/server) runs on Node,
 * where `crypto.randomUUID` always exists.
 */
const SERVER_ONLY = /\.server\.ts$|(^|\/)\+server\.ts$|^lib\/server\//;
const ALLOWED = new Set([
	'lib/domain/shared/mint-id.ts', // the minter itself, guarded
	'lib/ui/shell/live-sync.client.ts' // guarded with its own fallback
]);

describe('ids minted outside server-only code work on a plain-http install', () => {
	it('never calls crypto.randomUUID directly where a browser may run the code', () => {
		const offenders = appFiles()
			.filter((path) => !SERVER_ONLY.test(relative(SRC, path)))
			.map(parsed)
			.filter((file) => !ALLOWED.has(file.path))
			.flatMap((file) => file.calls.filter((call) => call.callee === 'crypto.randomUUID').map((call) => `${file.path}:${call.line}`));
		expect(offenders).toEqual([]);
	}, 120_000); // parses the whole app once

	it('reads calls from components and modules alike', () => {
		expect(parsed(`${SRC}/lib/domain/shared/mint-id.ts`).calls.map((c) => c.callee)).toContain('crypto.randomUUID');
		expect(parsed(`${SRC}/lib/ui/shell/live-sync.client.ts`).calls.map((c) => c.callee)).toContain('crypto.randomUUID');
	});
});
