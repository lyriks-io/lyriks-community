import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type RetrospecAct } from './acts';
import { emptyRetrospecDocument, parseRetrospecDocument, type RetrospecDocument } from './document';
import { specValidationBoard, validationLead, type SpecElement } from './spec-validation';
import type { TeamMember } from './spec-validators';

/** The lead is chosen at any time, like any role, and holds through later runs (action 34e2b66f of feat-135). */

const ana = { id: 'ana@example.test', name: 'Ana' };
const sam = { id: 'sam@example.test', name: 'Sam' };
const at = '2026-11-24T12:00:00.000Z';
const act = (doc: RetrospecDocument, acts: RetrospecAct[], actor = ana) => {
	const out = applyRetrospecActs(doc, acts, { actor, now: at });
	if (!out.ok) throw new Error(out.reason);
	return out.doc;
};
const validate = (itemId: string): RetrospecAct => ({ op: 'validate', itemId, title: itemId, tab: 'spec360' });
const elements: SpecElement[] = [{ id: 'branding', title: 'Branding' }];
const team: TeamMember[] = [{ person: ana, jobIds: ['design'] }, { person: sam, jobIds: [] }];

describe('who leads the validation [criterion:c6d86354]', () => {
	it('is whoever started the run while the project chose nobody', () => {
		expect(validationLead(act(emptyRetrospecDocument(), [validate('branding')]), null)).toEqual(ana);
	});

	it('is the person the project chose, from the moment it chose them [unspa:1359c25e:34e2b66f:f134ee54]', () => {
		const doc = act(act(emptyRetrospecDocument(), [validate('branding')]), [{ op: 'set_lead', to: sam }]);
		expect(validationLead(doc, null)).toEqual(sam);
		expect(doc.lead).toEqual({ to: sam, by: ana, at });
	});

	it('changes again along the way, the latest choice replacing the former one [unspa:1359c25e:34e2b66f:9d58e9be]', () => {
		const doc = act(act(emptyRetrospecDocument(), [{ op: 'set_lead', to: sam }]), [{ op: 'set_lead', to: ana }]);
		expect(validationLead(doc, null)).toEqual(ana);
	});

	it('makes every element wait on the new lead too, validations already given staying', () => {
		const given = act(emptyRetrospecDocument(), [validate('branding')]);
		expect(specValidationBoard({ doc: given, elements, team, viewer: ana, baselines: [] }).standings.branding.state).toBe('ok');
		const board = specValidationBoard({ doc: act(given, [{ op: 'set_lead', to: sam }]), elements, team, viewer: ana, baselines: [] });
		expect(board.standings.branding).toMatchObject({ state: 'waiting', validatedBy: [ana], missing: [sam] });
	});

	it('holds through a later run and a reload of the document', () => {
		const doc = parseRetrospecDocument(JSON.parse(JSON.stringify(act(emptyRetrospecDocument(), [{ op: 'set_lead', to: sam }]))));
		expect(doc.lead?.to).toEqual(sam);
		expect(validationLead(act(doc, [validate('branding')]), null)).toEqual(sam);
	});

	it('refuses a choice that names nobody', () => {
		expect(applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'set_lead', to: { id: ' ', name: '' } }], { actor: ana, now: at })).toMatchObject({ ok: false, reason: 'Choose who leads the validation.' });
	});
});
