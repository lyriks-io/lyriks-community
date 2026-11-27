import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type RetrospecAct } from './acts';
import { emptyRetrospecDocument, type RetrospecDocument } from './document';
import { RETROSPEC_PHASES, checkedSince, retrospecBaseline, runProgress, sectionRevision } from './progress';
import { pausedRetrospecLabel, reviewCounts, retrospecStatus, everRebuilt, type RetrospecFacts } from './status';
import { lastRunOf } from './last-run';
import { homeRuns } from '$domain/activity';
import { NO_READS } from '$domain/activity';
import { figuresLine, retrospecEvents } from './events';

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const bob = { id: 'bob@acme.io', name: 'Bob R.' };
const T0 = '2026-10-26T10:00:00.000Z';
const T1 = '2026-10-26T10:05:00.000Z';
const T2 = '2026-10-26T10:30:00.000Z';

function doc(acts: RetrospecAct[], actor = ana, now = T0): RetrospecDocument {
	const outcome = applyRetrospecActs(emptyRetrospecDocument(), acts, { actor, now });
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.doc;
}

const facts = (over: Partial<RetrospecFacts> = {}): RetrospecFacts => ({
	doc: emptyRetrospecDocument(),
	revisions: {},
	auditTimes: [],
	rebuiltFrom: null,
	hasSpec: false,
	...over
});

describe('section revisions', () => {
	it('sums a section stored in slices', () => {
		expect(sectionRevision({ foundation: 2, 'foundation.identity': 3, features: 9, 'foundationx': 50 }, 'foundation')).toBe(5);
	});

	it('records a baseline for every section a run writes', () => {
		const baseline = retrospecBaseline({ features: 4, data: 2 });
		expect(baseline).toMatchObject({ features: 4, data: 2, documents: 0, architecture: 0 });
		expect(Object.keys(baseline)).not.toContain('evolution');
	});
});

describe('the progress of a run', () => {
	it('counts only what moved since the baseline, never a clock', () => {
		const p = runProgress({ revisions: { documents: 1, scope: 1, features: 7 }, baseline: { features: 7 }, checked: false, mode: 'repo' });
		expect(p.phases[0]).toMatchObject({ key: 'sources', share: 1, state: 'done' });
		expect(p.phases.find((x) => x.key === 'features')?.share).toBe(0);
		expect(p.pct).toBe(Math.round(100 / RETROSPEC_PHASES.length));
		expect(p.started).toBe(true);
	});

	it('marks the phase the AI wrote last as the one in progress', () => {
		const p = runProgress({ revisions: { documents: 1, features: 2 }, baseline: {}, checked: false, mode: 'repo', lastWritten: 'features' });
		expect(p.phases.filter((x) => x.state === 'current').map((x) => x.key)).toEqual(['sources']);
		const q = runProgress({ revisions: { documents: 1, scope: 1, foundation: 1 }, baseline: {}, checked: false, mode: 'repo', lastWritten: 'foundation.identity' });
		expect(q.phases.find((x) => x.state === 'current')?.key).toBe('product');
	});

	it('reaches 100 % with the final check only', () => {
		const all = Object.fromEntries(['documents', 'scope', 'foundation', 'users', 'features', 'data', 'experience', 'rules', 'glossary', 'architecture'].map((s) => [s, 1]));
		expect(runProgress({ revisions: all, baseline: {}, checked: false, mode: 'repo' }).pct).toBeLessThan(100);
		expect(runProgress({ revisions: all, baseline: {}, checked: true, mode: 'repo' }).pct).toBe(100);
	});

	it('names the first phase after the documentation in docs mode', () => {
		expect(runProgress({ revisions: {}, baseline: {}, checked: false, mode: 'docs' }).phases[0].label).toBe('Reading your documentation');
	});

	it('sees the final check from the audits run since the start', () => {
		expect(checkedSince([T0], T1)).toBe(false);
		expect(checkedSince([T2], T1)).toBe(true);
		expect(checkedSince([T0], null)).toBe(true);
	});
});

describe('the status of a retrospecification', () => {
	it('is not started on a project with nothing read from code', () => {
		expect(retrospecStatus(facts())).toMatchObject({ status: 'start', pct: 0, label: 'Reverse-Specification not started', published: false });
		expect(retrospecStatus(facts({ hasSpec: true })).status).toBe('start');
	});

	it('is starting until the AI writes or the prompt runs', () => {
		const d = doc([{ op: 'start', mode: 'repo', baseline: { features: 2 } }]);
		expect(retrospecStatus(facts({ doc: d, revisions: { features: 2 } }))).toMatchObject({ status: 'source', label: 'Reverse-Specification starting' });
	});

	it('runs live once the AI writes, its percentage read from the sections', () => {
		const d = doc([{ op: 'start', mode: 'repo', baseline: {} }]);
		const s = retrospecStatus(facts({ doc: d, revisions: { documents: 1, scope: 1 } }));
		expect(s.status).toBe('running');
		expect(s.label).toBe(`Live Reverse-Specification · ${s.pct} %`);
		expect(s.pct).toBeGreaterThan(0);
		const launched = doc([{ op: 'start', mode: 'repo', baseline: {} }, { op: 'launch' }]);
		expect(retrospecStatus(facts({ doc: launched })).status).toBe('running');
	});

	it('is ready to review once the final check ran after the start', () => {
		const d = doc([{ op: 'start', mode: 'repo', baseline: {} }]);
		expect(retrospecStatus(facts({ doc: d, revisions: { features: 3 }, auditTimes: [T2] })).status).toBe('bilan');
		expect(retrospecStatus(facts({ doc: d, revisions: { features: 3 }, auditTimes: ['2026-10-25T10:00:00.000Z'] })).status).toBe('running');
	});

	it('runs live as soon as the AI writes its sources or scope on a project created from a codebase, before any feature', () => {
		expect(retrospecStatus(facts({ rebuiltFrom: 'repo', revisions: { documents: 1 } })).status).toBe('running');
		expect(retrospecStatus(facts({ rebuiltFrom: 'repo', revisions: { 'scope.capabilities': 2 } })).status).toBe('running');
		// Creating the project writes its identity: that is not the AI at work.
		expect(retrospecStatus(facts({ rebuiltFrom: 'repo', revisions: { foundation: 1, 'foundation.identity': 1 } })).status).toBe('start');
		expect(retrospecStatus(facts({ rebuiltFrom: 'repo' })).status).toBe('start');
		// A project started from scratch never reads as a retrospecification.
		expect(retrospecStatus(facts({ revisions: { documents: 1, scope: 1 } })).status).toBe('start');
	});

	it('reads a project rebuilt from code without a run started here as its analysis', () => {
		expect(retrospecStatus(facts({ rebuiltFrom: 'repo', hasSpec: true, revisions: { features: 4 } })).status).toBe('running');
		expect(retrospecStatus(facts({ rebuiltFrom: 'repo', hasSpec: true, revisions: { features: 4 }, auditTimes: [T0] })).status).toBe('bilan');
	});

	it('counts the review against the total last seen', () => {
		const d = doc([
			{ op: 'start', mode: 'repo', baseline: {} },
			{ op: 'start_review', total: 4 },
			{ op: 'validate', itemId: 'a', title: 'A', tab: 'data' },
			{ op: 'reject', itemId: 'b', title: 'B', tab: 'data' },
			{ op: 'set_aside', itemId: 'c', title: 'C', tab: 'data' }
		]);
		expect(retrospecStatus(facts({ doc: d }))).toMatchObject({ status: 'review', pct: 50, label: 'Reverse-Specification in validation · 2 / 4 validated' });
		expect(reviewCounts(d.runs[0], ['a', 'b', 'c', 'd', 'e'])).toMatchObject({ handled: 2, later: 1, total: 5 });
	});

	it('is done once published, and stays published while a new run goes on', () => {
		const d = doc([{ op: 'start', mode: 'repo', baseline: {} }, { op: 'start_review', total: 1 }, { op: 'publish', baselineId: 'b1' }]);
		expect(retrospecStatus(facts({ doc: d }))).toMatchObject({ status: 'done', pct: 100, published: true, publishedAt: T0 });
		const again = applyRetrospecActs(d, [{ op: 'start', mode: 'repo', baseline: {} }], { actor: ana, now: T1 });
		if (!again.ok) throw new Error(again.reason);
		expect(retrospecStatus(facts({ doc: again.doc }))).toMatchObject({ status: 'source', published: true, publishedAt: T0 });
	});
});

describe('the events of a retrospecification', () => {
	it('says what happened, newest first, with who did it and where it opens', () => {
		let d = doc([{ op: 'start', mode: 'repo', baseline: {} }]);
		const later = applyRetrospecActs(d, [{ op: 'validate', itemId: 'feature:f1', title: 'Invoicing', tab: 'features' }, { op: 'share', itemId: 'role:r1', title: 'Admin', tab: 'users', to: bob }], { actor: ana, now: T2 });
		if (!later.ok) throw new Error(later.reason);
		d = later.doc;
		const events = retrospecEvents(d, { projectId: 'p-1', productName: 'Facturo', auditEntries: [{ performedAt: T1, actor: 'local' }] });
		expect(events.map((e) => e.kind)).toEqual(['item_validated', 'item_shared', 'analysis_finished', 'run_started']);
		expect(events[0]).toMatchObject({ authorEmail: ana.id, authorName: ana.name, text: 'validated “Invoicing”', href: '/projects/p-1/retrospec?step=validation&tab=features&item=feature%3Af1' });
		expect(events[1]).toMatchObject({ toEmail: bob.id, toName: bob.name });
		expect(events[2]).toMatchObject({
			authorEmail: undefined,
			text: 'Lyriks rebuilt the specification of Facturo. See the result in the Specification 360°.',
			href: '/projects/p-1/spec'
		});
	});

	it('announces what the AI built when it finishes, leaving out what the specification does not hold [criterion:f04182b8]', () => {
		const d = doc([{ op: 'start', mode: 'repo', baseline: {} }]);
		const input = { projectId: 'p-1', productName: 'Signal for iOS', auditEntries: [{ performedAt: T1, actor: 'local' }] };
		const finished = (figures: { cores: number; features: number; rules: number; users: number }) =>
			retrospecEvents(d, { ...input, figures }).find((e) => e.kind === 'analysis_finished');
		expect(finished({ cores: 9, features: 17, rules: 296, users: 11 })).toMatchObject({
			text: 'Lyriks rebuilt the specification of Signal for iOS: 9 core features, 17 features, 296 rules, 11 users. See the result in the Specification 360°.',
			href: '/projects/p-1/spec'
		});
		expect(finished({ cores: 1, features: 1, rules: 0, users: 1 })?.text).toBe(
			'Lyriks rebuilt the specification of Signal for iOS: 1 core feature, 1 feature, 1 user. See the result in the Specification 360°.'
		);
		expect(figuresLine(undefined)).toBe('');
	});
});

describe('a run whose LLM went silent reads paused on Home, never running [criterion:7a4a99e4]', () => {
	it('reads Inactive in Running now, never Running', () => {
		const started = doc([{ op: 'start', mode: 'repo', baseline: {} }]);
		const running = retrospecStatus(facts({ doc: started, revisions: { documents: 1 } }));
		expect(running.status).toBe('running');
		const read = (paused: boolean) => lastRunOf({ status: running, doc: started, rebuiltFrom: 'repo', productName: 'Floppy Bird', paused, when: () => 'now' });
		const paused = read(true);
		expect(paused).toMatchObject({ state: 'paused', detail: `Stopped at ${running.pct} %: your LLM stopped calling Lyriks` });
		const [card] = homeRuns(
			[{ id: 'fb', name: 'Floppy Bird', requests: [], reads: NO_READS, run: { ...paused!, href: '/projects/fb/retrospec', at: T0, pct: running.pct }, drift: null, mayEdit: true }],
			{ me: 'me', roster: [], now: Date.parse(T0) }
		);
		expect([card.state, card.line]).toEqual(['inactive', `Stopped at ${running.pct} %: your LLM stopped calling Lyriks`]);
		expect(read(false)?.state).toBe('running');
		expect(pausedRetrospecLabel(running.pct)).toBe(`Reverse-Specification paused · ${running.pct} %`);
	});
});

describe('the Specification 360° events', () => {
	const ana = { id: 'ana@acme.io', name: 'Ana P.' };
	const bob = { id: 'bob@acme.io', name: 'Bob R.' };
	const input = (auditAt: string | null) => ({ projectId: 'p1', productName: 'Facturo', auditEntries: auditAt ? [{ performedAt: auditAt, actor: 'ana@acme.io' }] : [] });
	const run = {
		id: 'run-1',
		mode: 'repo' as const,
		implicit: false,
		startedAt: '2026-10-26T10:00:00.000Z',
		startedBy: ana,
		baseline: {},
		launchedAt: '2026-10-26T10:01:00.000Z',
		analysisEndedAt: null,
		analysisEndedBy: null,
		reviewStartedAt: '2026-10-26T11:00:00.000Z',
		itemTotal: 0,
		publishedAt: null,
		publishedBy: null,
		baselineId: null,
		verdicts: { branding: { title: 'Branding', tab: 'spec360', validatedBy: [{ person: ana, at: '2026-10-26T11:00:00.000Z' }], flag: null } },
		notifyWhenReady: [ana, bob],
		reminders: [{ itemId: 'branding', title: 'Branding', by: ana, to: bob, at: '2026-10-26T11:05:00.000Z' }]
	};

	it('tells the whole project once the AI finished, so who asked hears it once, and links validations and reminders to the element', () => {
		const events = retrospecEvents({ version: 1, runs: [run], comments: {} }, input('2026-10-26T10:30:00.000Z'));
		expect(events.filter((e) => e.kind === 'analysis_finished')).toEqual([expect.objectContaining({ team: true })]);
		expect(events.find((e) => e.kind === 'item_validated')?.href).toBe('/projects/p1/spec/experience#kbt-branding');
		expect(events.find((e) => e.kind === 'reminder')).toMatchObject({ toEmail: 'bob@acme.io', href: '/projects/p1/spec/experience#kbt-branding' });
	});

	it('tells nobody the analysis is ready before it finished', () => {
		const events = retrospecEvents({ version: 1, runs: [run], comments: {} }, input(null));
		expect(events.some((e) => e.kind === 'analysis_finished')).toBe(false);
	});
});

// Field run 2026-10-27: "Features and actions" read done (88 %) while no feature had a single action.
describe('the features phase counts what the features do', () => {
	const leaves = ['f1', 'f2', 'f3', 'f4'];
	const authored = (ids: string[], at = T1) => ({ ...emptyRetrospecDocument(), behaviorAuthored: Object.fromEntries(ids.map((id) => [id, at])) });
	const featuresPhase = (f: RetrospecFacts) => {
		const s = retrospecStatus(f);
		return { status: s.status, pct: s.pct };
	};

	it('is half done with the tree alone and done once every leaf has its behaviour', () => {
		const base = { rebuiltFrom: 'repo' as const, hasSpec: true, leafFeatureIds: leaves, revisions: { features: 1 } };
		const treeOnly = featuresPhase(facts(base));
		const all = featuresPhase(facts({ ...base, doc: authored(leaves) }));
		const half = featuresPhase(facts({ ...base, doc: authored(['f1', 'f2']) }));
		expect(treeOnly.pct).toBeLessThan(half.pct);
		expect(half.pct).toBeLessThan(all.pct);
	});

	it('counts only the behaviour written since the run started', () => {
		const d = { ...doc([{ op: 'start', mode: 'repo', baseline: {} }], ana, T1), behaviorAuthored: { f1: T0, f2: T2 } };
		const before = runProgress({ revisions: { features: 1 }, baseline: {}, checked: false, mode: 'repo', behavior: { authored: 0, leaves: 4 } });
		const s = retrospecStatus(facts({ doc: d, revisions: { features: 1 }, leafFeatureIds: leaves }));
		expect(s.pct).toBeGreaterThan(before.pct);
		const features = runProgress({ revisions: { features: 1 }, baseline: {}, checked: false, mode: 'repo', behavior: { authored: 1, leaves: 4 } });
		expect(s.pct).toBe(features.pct);
	});

	it('records a feature once and refuses a nameless one', () => {
		const once = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'behavior_authored', featureId: 'f1' }], { actor: ana, now: T0 });
		expect(once.ok && once.doc.behaviorAuthored).toEqual({ f1: T0 });
		const again = once.ok ? applyRetrospecActs(once.doc, [{ op: 'behavior_authored', featureId: 'f1' }], { actor: ana, now: T2 }) : null;
		expect(again?.ok && again.doc.behaviorAuthored).toEqual({ f1: T0 });
		expect(applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'behavior_authored', featureId: ' ' }], { actor: ana, now: T0 }).ok).toBe(false);
	});
});

describe('a product never rebuilt reads no Reverse-Specification [criterion:4d51ac1d]', () => {
	const implicit = (d: ReturnType<typeof doc>) => ({ ...d, runs: d.runs.map((r) => ({ ...r, implicit: true })) });
	const recorded = implicit(doc([{ op: 'start', mode: 'repo', baseline: {} }]));

	it('takes the record of hand edits on a product from scratch for no analysis', () => {
		expect(retrospecStatus(facts({ doc: recorded, revisions: { documents: 1, scope: 1 } }))).toMatchObject({ status: 'start', pct: 0 });
		expect(everRebuilt(recorded, null)).toBe(false);
	});

	it('reads as before a run started from its page, and a product rebuilt from its code', () => {
		const started = doc([{ op: 'start', mode: 'repo', baseline: {} }]);
		expect(retrospecStatus(facts({ doc: started, revisions: { documents: 1, scope: 1 } })).status).toBe('running');
		expect(everRebuilt(started, null)).toBe(true);
		expect(everRebuilt(recorded, 'repo')).toBe(true);
	});

	it('knows no run at all as never rebuilt', () => {
		expect(everRebuilt(emptyRetrospecDocument(), null)).toBe(false);
	});

	it('reads no review nor publication on a product from scratch whose people validated in Knowledge [criterion:9b3dbb64]', () => {
		const reviewed = implicit(doc([{ op: 'start', mode: 'repo', baseline: {} }, { op: 'start_review', total: 3 }]));
		expect(reviewed.runs.at(-1)?.reviewStartedAt).toBeTruthy();
		expect(retrospecStatus(facts({ doc: reviewed, revisions: { documents: 1, scope: 1, features: 4 }, hasSpec: true }))).toMatchObject({ status: 'start', pct: 0 });
		// The same review on a product rebuilt from its code reads as a run in validation.
		expect(retrospecStatus(facts({ doc: reviewed, rebuiltFrom: 'repo', revisions: { documents: 1, scope: 1 } })).status).toBe('review');
	});
});
