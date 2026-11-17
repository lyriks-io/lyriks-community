import { describe, expect, it } from 'vitest';
import { DOC_GROUPS, DOC_TOPICS, START_PATHS, helpEntries, topicInView, topicsMatching, stepOpenedBy } from './doc-topics';

describe('the Documentation narrows by what its topics say and lights the topic in view [criterion:e3629a5f]', () => {
	it('lists the topics the owner expects, each in a group of the contents, once', () => {
		expect(DOC_TOPICS.map((t) => t.label)).toEqual([
			'Get help',
			'Where to start',
			'What Lyriks is',
			'Editions',
			'Projects and folders',
			'Reverse-Specification',
			'Knowledge',
			'Validating the specification',
			'Follow-up',
			'Working with your AI',
			'Health and the other measures',
			'Team, roles and jobs',
			'Search',
			'Deployment and air-gap',
			'Keyboard shortcuts',
			'Troubleshooting',
			'Words of Lyriks'
		]);
		expect(new Set(DOC_TOPICS.map((t) => t.id)).size).toBe(DOC_TOPICS.length);
		for (const t of DOC_TOPICS) expect(DOC_GROUPS).toContain(t.group);
	});

	it('keeps every topic while nothing is typed, and the ones holding every word typed, text included', () => {
		const texts = { measures: 'One score out of 100 with its word: Strong, To watch, Critical.', ai: 'Connect my AI copies the prompt.' };
		expect(topicsMatching(DOC_TOPICS, texts, '  ')).toHaveLength(DOC_TOPICS.length);
		expect(topicsMatching(DOC_TOPICS, texts, 'to watch').map((t) => t.id)).toEqual(['measures']);
		expect(topicsMatching(DOC_TOPICS, texts, 'CONNECT prompt').map((t) => t.id)).toEqual(['ai']);
		expect(topicsMatching(DOC_TOPICS, {}, 'discord').map((t) => t.id)).toEqual(['get-help']);
		expect(topicsMatching(DOC_TOPICS, texts, 'zzz nothing')).toEqual([]);
	});

	it('lights the last topic whose top passed the reading line, the first one before any did', () => {
		const tops = [
			{ id: 'get-help', top: 40 },
			{ id: 'start', top: 300 },
			{ id: 'what', top: 900 }
		];
		expect(topicInView(tops, 120)).toBe('get-help');
		expect(topicInView(tops.map((t) => ({ ...t, top: t.top - 250 })), 120)).toBe('start');
		expect(topicInView(tops.map((t) => ({ ...t, top: t.top + 500 })), 120)).toBe('get-help');
		expect(topicInView([], 120)).toBeNull();
	});

	it('offers First steps, Guided tour, Leave us feedback, and the community only once its address is known', () => {
		const without = helpEntries({ guideUrl: 'https://get.lyriks.io/first-steps', discord: null });
		expect(without.map((e) => e.title)).toEqual(['First steps', 'Guided tour', 'Leave us feedback']);
		expect(without.find((e) => e.key === 'tour')?.href).toBe('https://get.lyriks.io/first-steps');
		expect(without.find((e) => e.key === 'first-steps')?.href).toBeUndefined();
		const known = helpEntries({ guideUrl: 'https://get.lyriks.io/first-steps', discord: 'https://discord.gg/lyriks' });
		expect(known.map((e) => e.title)).toEqual(['First steps', 'Guided tour', 'Community on Discord', 'Leave us feedback']);
	});

	it('draws no way out of the installation where an administrator did not allow it', () => {
		const shut = helpEntries({ guideUrl: null, discord: null });
		expect(shut.map((e) => e.title)).toEqual(['First steps', 'Leave us feedback']);
		expect(shut.some((e) => e.href)).toBe(false);
	});

	it('gives each kind of reader a path whose every step points at a topic of the page', () => {
		const ids = new Set(DOC_TOPICS.map((t) => t.id));
		expect(START_PATHS.map((p) => p.who)).toEqual(['Product owner or analyst', 'Developer working with the MCP', 'Reviewer who validates', 'Administrator or operator']);
		for (const p of START_PATHS) for (const s of p.steps) expect(ids.has(s.topic)).toBe(true);
	});
});

describe('stepOpenedBy', () => {
	const steps = START_PATHS.flatMap((p) => p.steps);
	const changes = steps.find((s) => s.topic === 'follow-up' && s.lock)!;
	const invite = steps.find((s) => s.topic === 'team')!;
	it('names the plan that opens a locked step on Community', () => {
		expect(stepOpenedBy(changes, 'community')).toBe('Solo Builder');
		expect(stepOpenedBy(invite, 'community')).toBe('Team');
	});
	it('leaves every step open on a paid installation and the open steps open on Community', () => {
		expect(stepOpenedBy(changes, 'enterprise')).toBeNull();
		expect(stepOpenedBy(changes, null)).toBeNull();
		expect(stepOpenedBy(steps.find((s) => s.topic === 'ai')!, 'community')).toBeNull();
	});
});
