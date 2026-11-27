import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type ActContext, type RetrospecAct } from './acts';
import { emptyRetrospecDocument, parseRetrospecDocument, type RetrospecDocument } from './document';
import { namedValidators, specValidationBoard, type SpecElement } from './spec-validation';
import { eligibleValidators, reviewSeats, type TeamMember } from './spec-validators';

/**
 * A project names the people who validate it (field report 2026-11-25, decided 2026-11-26): only their jobs are waited on,
 * the lead always is, and a project that never named anyone keeps everyone who can open it.
 */

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const bob = { id: 'bob@acme.io', name: 'Bob R.' };
const cleo = { id: 'cleo@acme.io', name: 'Cleo D.' };
const ctx = (actor = ana): ActContext => ({ actor, now: '2026-11-26T10:00:00.000Z' });
const team: TeamMember[] = [
	{ person: ana, jobIds: ['product'] },
	{ person: bob, jobIds: ['design'] },
	{ person: cleo, jobIds: ['product'] }
];
const elements: SpecElement[] = [{ id: 'branding', title: 'Branding' }];

function acted(doc: RetrospecDocument, acts: RetrospecAct[], c = ctx()) {
	return applyRetrospecActs(doc, acts, c);
}
function act(doc: RetrospecDocument, acts: RetrospecAct[], c = ctx()): RetrospecDocument {
	const out = acted(doc, acts, c);
	if (!out.ok) throw new Error(out.reason);
	return out.doc;
}
const created = () => act(emptyRetrospecDocument(), [{ op: 'set_lead', to: ana }, { op: 'set_validator', to: ana, validates: true }]);

describe('a new project waits on its creator alone [criterion:e3296696] [criterion:bfe225b4]', () => {
	it('waits on nobody else by their jobs, though they can open it', () => {
		const board = specValidationBoard({ doc: created(), elements, team, viewer: ana, baselines: [] });
		expect(board.standings.branding.required).toEqual([ana]);
	});

	it('keeps everyone who can open an older project, which named nobody', () => {
		const board = specValidationBoard({ doc: emptyRetrospecDocument(), elements, team, viewer: ana, baselines: [] });
		expect(board.standings.branding.required).toEqual([ana, bob]);
		expect(namedValidators(emptyRetrospecDocument())).toBeNull();
	});
});

describe('a person ticked Validates is waited on by their jobs [criterion:f09fe8ea] [criterion:4f9e6b73]', () => {
	it('adds the design job once Bob is ticked, and takes it off when he is unticked', () => {
		const ticked = act(created(), [{ op: 'set_validator', to: bob, validates: true }]);
		expect(eligibleValidators(reviewSeats(ana, team, [], 'branding', namedValidators(ticked)))).toEqual([ana, bob]);
		const unticked = act(ticked, [{ op: 'set_validator', to: bob, validates: false }]);
		expect(eligibleValidators(reviewSeats(ana, team, [], 'branding', namedValidators(unticked)))).toEqual([ana]);
	});

	it('never waits on an unticked holder of a job, who can still be asked by name', () => {
		const doc = created();
		expect(eligibleValidators(reviewSeats(ana, team, [], 'branding', namedValidators(doc)))).toEqual([ana]);
		expect(eligibleValidators(reviewSeats(ana, team, [bob], 'branding', namedValidators(doc)))).toEqual([ana, bob]);
	});

	it('refuses to untick the lead, who always validates [rule:79c2b49c]', () => {
		const out = acted(created(), [{ op: 'set_validator', to: ana, validates: false }]);
		expect(out).toEqual({ ok: false, reason: 'The lead always validates: make someone else lead first.' });
	});

	it('keeps the choice through a save and a read', () => {
		const ticked = act(created(), [{ op: 'set_validator', to: bob, validates: true }]);
		const read = parseRetrospecDocument(JSON.parse(JSON.stringify(ticked)));
		expect(namedValidators(read)).toEqual([ana, bob]);
	});

	it('changes nothing when the choice already stands', () => {
		const doc = created();
		const again = acted(doc, [{ op: 'set_validator', to: ana, validates: true }]);
		expect(again.ok && again.doc).toBe(doc);
	});
});
