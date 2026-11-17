import { describe, expect, it } from 'vitest';
import { healthAbout, healthFigure, healthHint, overviewFigures, type OverviewFiguresInput } from './overview';

const input = (over: Partial<OverviewFiguresInput> = {}): OverviewFiguresInput => ({
	cores: [{ features: 10 }, { features: 3 }],
	users: [{ userClass: 'end' }, { userClass: 'end' }, { userClass: 'admin' }],
	health: { score: 10, verdict: 'critical', blocking: 2, total: 12 },
	healthReading: false,
	noticed: { total: 300, pending: 271, major: 3, minor: 268 },
	...over
});

describe('the Overview opens on the product and its four figures [criterion:416e4885]', () => {
	it('counts the features in their areas, the users by class and the points still to review', () => {
		const [features, users, , noticed] = overviewFigures(input());
		expect([features.value, features.label, features.line, features.target]).toEqual(['13', 'Features', 'In 2 areas', 'kb-what']);
		expect([users.value, users.line, users.target]).toEqual(['3', '2 end users · 1 admin', 'kb-who']);
		expect([noticed.value, noticed.line, noticed.target]).toEqual(['271', '3 major · 268 minor', 'kb-noticed']);
	});

	it('names one of a thing in the singular', () => {
		const [features, users] = overviewFigures(input({ cores: [{ features: 1 }], users: [{ userClass: 'end' }] }));
		expect(features.line).toBe('In 1 area');
		expect(users.line).toBe('1 end user · 0 admins');
	});
});

describe('the Overview reads Project health as a figure beside its word [criterion:f5909522]', () => {
	it('reads the served score out of 100 with its word in its colour, leading to What Lyriks noticed', () => {
		const health = overviewFigures(input())[2];
		expect([health.value, health.word, health.line, health.tone, health.target]).toEqual(['10/100', { text: 'Critical', tone: 'red' }, 'Score', 'red', 'kb-noticed']);
		expect(overviewFigures(input({ health: { score: 82, verdict: 'strong', blocking: 0, total: 1 } }))[2].word).toEqual({ text: 'Strong', tone: 'green' });
		expect(overviewFigures(input({ health: { score: 57, verdict: 'watch', blocking: 0, total: 1 } }))[2].word).toEqual({ text: 'To watch', tone: 'orange' });
	});

	it('says what it weighs and how many points wait when pointed at, and when it reads the spec alone', () => {
		expect(healthHint({ score: 57, verdict: 'watch', blocking: 2, total: 12 })).toMatch(/computed from every point in What Lyriks noticed.*Now: 12 points wait, 2 of them blocking\.$/);
		expect(healthHint({ score: 90, verdict: 'strong', blocking: 0, total: 1 })).toMatch(/Now: 1 point waits\.$/);
		const codeless = overviewFigures(input({ health: { score: 40, verdict: 'watch', blocking: 0, total: 3, codeLinked: false } }))[2];
		expect(codeless.noCode).toBe(true);
		expect(codeless.hint).toContain('No code linked yet: the health reads the specification alone.');
	});

	it('says the first reading is being taken, never a score of nothing [criterion:ac-leaf-ac-score-shown-at-once]', () => {
		const [, , health, noticed] = overviewFigures(input({ health: null, healthReading: true, noticed: { total: 0, pending: 0, major: 0, minor: 0 } }));
		expect([health.value, health.word, health.line]).toEqual(['…', null, 'Reading…']);
		expect([noticed.value, noticed.line]).toEqual(['…', 'Reading…']);
	});
});

describe('the Health tile says what it measures and opens Health [criterion:f5909522]', () => {
	it('names what it measures under its line, and only Health does', () => {
		const figures = overviewFigures(input({ healthHref: '/projects/p/spec/tech/health' }));
		expect(figures.map((f) => f.about)).toEqual([null, null, 'How sound the spec is: complete, coherent, proven against the code', null]);
		expect(healthAbout({ score: 40, verdict: 'watch', blocking: 0, total: 3, codeLinked: false })).toBe('How sound the spec is: complete and coherent');
	});

	it('leads to the page that tells the reading in full, the other figures staying on the page', () => {
		const figures = overviewFigures(input({ healthHref: '/projects/p/spec/tech/health' }));
		expect(figures.map((f) => f.href)).toEqual([null, null, '/projects/p/spec/tech/health', null]);
	});
});

describe('Health tells the project score, the figure of the Overview opening it [criterion:4dadd4b8]', () => {
	it('reads the very figure the Overview shows, its click opening Health', () => {
		const overview = overviewFigures(input({ healthHref: '/projects/p/spec/tech/health' }))[2];
		const tab = healthFigure(input().health, false, '/projects/p/spec/noticed');
		expect({ ...tab, href: null }).toEqual({ ...overview, href: null });
		expect(tab.href).toBe('/projects/p/spec/noticed');
	});

	it('waits for the first reading rather than reading a score', () => {
		const tab = healthFigure(null, true, '/projects/p/spec/noticed');
		expect([tab.value, tab.word, tab.line]).toEqual(['…', null, 'Reading…']);
	});
});

describe('before the first feature no score is drawn [criterion:01761816]', () => {
	it('reads Not measured yet instead of a score', () => {
		expect(healthFigure(null, false, null).line).toBe('Not measured yet');
	});
});

describe('the Health figure says a proof is in progress [criterion:5785c1fb]', () => {
	it('keeps the last score and says the proof is in progress until it lands', () => {
		const proving = overviewFigures(input({ health: { score: 82, verdict: 'strong', blocking: 0, total: 1, proofPending: true } }))[2];
		expect([proving.value, proving.line]).toEqual(['82/100', 'Score · Proof in progress…']);
		expect(overviewFigures(input({ health: { score: 82, verdict: 'strong', blocking: 0, total: 1 } }))[2].line).toBe('Score');
	});
});
