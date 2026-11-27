import { describe, expect, it } from 'vitest';
import { AI_WAKER, WAKE_REFUSALS, wakeRefusal, wakeStateOf, wakerStatusOf, type WakeFacts } from './ai-waker';

// The person's waker (feat-ai-session, surface "My session with my AI"): the
// scenarios of its actions, run on the pure rules the server reads.
const S = '1f2ed844';
const LISTEN = '77cdb263';
const WAKE = 'ccca0911';
const OPENED = '4bc3eaf9';
const RUN_OUT = 'be0ba713';
const GONE = '6f9b9352';

const NOW = Date.parse('2026-11-25T23:00:00.000Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const facts = (over: Partial<WakeFacts> = {}): WakeFacts => ({
	waitingClickAts: [ago(5)],
	sessionsOpen: 0,
	waker: 'listening',
	wake: 'none',
	handedAt: null,
	...over
});

describe('Keep my waker listening, Mark a silent waker gone', () => {
	it(`a waker just heard listens [unspa:${S}:${LISTEN}:71250735]`, () => {
		expect(wakerStatusOf(ago(0), NOW)).toBe('listening');
	});

	it(`a waker gone comes back once it calls again [unspa:${S}:${LISTEN}:3b991afb]`, () => {
		expect(wakerStatusOf(ago(5000), NOW)).toBe('gone');
		expect(wakerStatusOf(ago(1), NOW)).toBe('listening');
	});

	it(`a silent waker reads gone after wakerGoneSeconds [unspa:${S}:${GONE}:dfbda8b7]`, () => {
		expect(wakerStatusOf(ago(AI_WAKER.wakerGoneSeconds), NOW)).toBe('gone');
	});

	it(`a waker between two calls still listens [unspa:${S}:${GONE}:c4fb4046]`, () => {
		expect(wakerStatusOf(ago(30), NOW)).toBe('listening');
	});

	it('no waker was ever heard', () => {
		expect(wakerStatusOf(null, NOW)).toBe('none');
	});
});

describe('Wake my AI', () => {
	it(`a click wakes the AI [unspa:${S}:${WAKE}:73365e47]`, () => {
		expect(wakeRefusal(facts())).toBeNull();
	});

	it(`an AI in session takes the click instead [unspa:${S}:${WAKE}:3381fb15]`, () => {
		expect(wakeRefusal(facts({ sessionsOpen: 1 }))).toBe(WAKE_REFUSALS.inSession);
	});

	it(`another AI in session takes the click instead [unspa:${S}:${WAKE}:8d33526a]`, () => {
		expect(wakeRefusal(facts({ sessionsOpen: 2 }))).toBe(WAKE_REFUSALS.inSession);
	});

	it(`without a waker the click waits for the prompt [unspa:${S}:${WAKE}:6f2734fe]`, () => {
		expect(wakeRefusal(facts({ waker: 'none' }))).toBe(WAKE_REFUSALS.noWaker);
	});

	it(`a gone waker wakes nothing [unspa:${S}:${WAKE}:d36c7a5a]`, () => {
		expect(wakeRefusal(facts({ waker: 'gone' }))).toBe(WAKE_REFUSALS.noWaker);
	});

	it(`one woken AI at a time [unspa:${S}:${WAKE}:4cbc8e08]`, () => {
		expect(wakeRefusal(facts({ waitingClickAts: [ago(20), ago(5)], wake: 'handed', handedAt: ago(10) }))).toBe(WAKE_REFUSALS.waking);
	});

	it(`nothing waiting wakes nothing [unspa:${S}:${WAKE}:51fa8ee8]`, () => {
		expect(wakeRefusal(facts({ waitingClickAts: [] }))).toBe(WAKE_REFUSALS.nothingWaits);
	});

	it(`a failed wake is not retried without a new click [unspa:${S}:${WAKE}:2a9657dd]`, () => {
		expect(wakeRefusal(facts({ waitingClickAts: [ago(400)], wake: 'not_woken', handedAt: ago(300) }))).toBe(WAKE_REFUSALS.notWoken);
	});

	it(`a wake runs out, then a later click wakes again [unspa:${S}:${WAKE}:57654559]`, () => {
		const handedAt = ago(300);
		expect(wakeStateOf(handedAt, [], NOW)).toBe('not_woken');
		expect(wakeRefusal(facts({ waitingClickAts: [ago(400), ago(5)], wake: 'not_woken', handedAt }))).toBeNull();
	});
});

describe('Record that the woken AI opened its session, The wake runs out', () => {
	it(`the woken AI settles its wake by opening a session [unspa:${S}:${OPENED}:d5fa31a4]`, () => {
		expect(wakeStateOf(ago(60), [ago(30)], NOW)).toBe('opened');
	});

	it(`a session from before the wake settles nothing [unspa:${S}:${OPENED}:87e320e0]`, () => {
		expect(wakeStateOf(ago(60), [ago(3000)], NOW)).toBe('handed');
		expect(wakeStateOf(null, [ago(30)], NOW)).toBe('none');
	});

	it(`a wake with no session runs out after wakeOpenSeconds [unspa:${S}:${RUN_OUT}:ab61a6fb]`, () => {
		expect(wakeStateOf(ago(AI_WAKER.wakeOpenSeconds), [], NOW)).toBe('not_woken');
	});

	it(`a starting AI still has time [unspa:${S}:${RUN_OUT}:04435eb7]`, () => {
		expect(wakeStateOf(ago(60), [], NOW)).toBe('handed');
	});
});
