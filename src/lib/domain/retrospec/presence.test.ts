import { describe, expect, it } from 'vitest';
import { CONNECTED_MS, WORKING_MS, aiConnected, aiPresence, aiSilentFor, runPaused } from './presence';

const at = '2026-10-29T10:00:00.000Z';
const t = Date.parse(at);

describe('the AI read as connected to a project', () => {
	it('an AI that never called is neither connected nor silent', () => {
		expect(aiSilentFor(null, t)).toBeNull();
		expect(aiConnected(null, t)).toBe(false);
	});

	it('reads connected right after a call, and for a while after it', () => {
		expect(aiConnected(at, t)).toBe(true);
		expect(aiConnected(at, t + CONNECTED_MS - 1)).toBe(true);
	});

	it('reads silent, no longer connected, once the window has passed', () => {
		expect(aiConnected(at, t + CONNECTED_MS)).toBe(false);
		expect(aiSilentFor(at, t + 7 * 60_000)).toBe(7 * 60_000);
	});

	it('a clock behind the call never reads a negative silence', () => {
		expect(aiSilentFor(at, t - 5000)).toBe(0);
		expect(aiConnected(at, t - 5000)).toBe(true);
	});
});

describe('what the person reads of their AI', () => {
	it('disconnected while it never called, and once it has been silent too long', () => {
		expect(aiPresence(null, t)).toBe('disconnected');
		expect(aiPresence(at, t + CONNECTED_MS)).toBe('disconnected');
	});

	it('working right after a call, then only connected', () => {
		expect(aiPresence(at, t + 1000)).toBe('working');
		expect(aiPresence(at, t + WORKING_MS)).toBe('connected');
		expect(aiPresence(at, t + CONNECTED_MS - 1)).toBe('connected');
	});
});

describe('a running retrospecification whose LLM went silent reads paused [criterion:7a4a99e4]', () => {
	it('stays live while its LLM works or is only quiet, waiting on the person', () => {
		expect(runPaused(at, t + 1000)).toBe(false);
		expect(runPaused(at, t + WORKING_MS + 1000)).toBe(false);
		expect(runPaused(at, t + CONNECTED_MS - 1)).toBe(false);
	});

	it('pauses once its LLM made no call for the connected window, or was never seen since the server started', () => {
		expect(runPaused(at, t + CONNECTED_MS)).toBe(true);
		expect(runPaused(null, t)).toBe(true);
	});
});
