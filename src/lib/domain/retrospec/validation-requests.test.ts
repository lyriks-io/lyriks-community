import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type RetrospecAct } from './acts';
import { emptyRetrospecDocument, parseRetrospecDocument, type RetrospecDocument } from './document';
import { canReviewElement, specValidationBoard, validationLead, type SpecElement } from './spec-validation';
import { retrospecEvents } from './events';

const lead = { id: 'lead@company.test', name: 'Product Lead' };
const tech = { id: 'tech@company.test', name: 'Tech Lead' };
const colleague = { id: 'colleague@company.test', name: 'Colleague' };
const team = [{ person: lead, jobIds: ['product'] }, { person: tech, jobIds: ['tech'] }, { person: colleague, jobIds: [] }];
const elements: SpecElement[] = [{ id: 'stack:a', title: 'Stack', owner: 'tech' }, { id: 'requirement:a', title: 'Requirements', owner: 'tech' }, { id: 'problem', title: 'Problem', owner: 'product' }];
const at = '2026-11-13T00:00:00.000Z';
function act(doc: RetrospecDocument, acts: RetrospecAct[], actor = lead, reviewOnly = false) {
	const result = applyRetrospecActs(doc, acts, { actor, now: at, reviewOnly });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
}
const request = (op: 'request_validation' | 'cancel_validation_request' = 'request_validation'): RetrospecAct => ({ op, itemId: 'stack:a', title: 'Stack', to: colleague });
const board = (doc: RetrospecDocument, members = team) => specValidationBoard({ doc, elements, team: members, viewer: lead, baselines: [] });

describe('question validation requests', () => {
	it('requires the tech person on every technical topic and adds a colleague only on one question [criterion:e3296696] [unspa:2e49df91:a2418cea:f082d9fb]', () => {
		const doc = act(emptyRetrospecDocument(), [request()]);
		expect(board(doc).standings['stack:a'].required).toEqual([lead, tech, colleague]);
		expect(board(doc).standings['requirement:a'].required).toEqual([lead, tech]);
		expect(board(doc).standings.problem.required).toEqual([lead]);
	});

	it('deduplicates requests and notifies the selected person once [unspa:2e49df91:a2418cea:fddd2458]', () => {
		const doc = act(emptyRetrospecDocument(), [request()]);
		expect(act(doc, [request()])).toBe(doc);
		const events = retrospecEvents(doc, { projectId: 'project', productName: 'Product', auditEntries: [] });
		expect(events.filter((event) => event.kind === 'validation_requested')).toEqual([expect.objectContaining({ toEmail: colleague.id, href: '/projects/project/spec/tech/architecture#kbt-stack_a' })]);
	});

	it('persists requests through parsing and edits; cancellation keeps defaults and approval evidence [unspa:2e49df91:f108239e:a6bcf8cb]', () => {
		let doc = act(emptyRetrospecDocument(), [request()]);
		doc = parseRetrospecDocument(JSON.parse(JSON.stringify(doc)));
		// An edit drops the element's validations (criterion e6029af6) but never the request.
		doc = act(doc, [{ op: 'edit', itemId: 'stack:a', title: 'Stack' }], colleague);
		expect(board(doc).standings['stack:a'].required).toContainEqual(colleague);
		doc = act(doc, [{ op: 'validate', itemId: 'stack:a', title: 'Stack', tab: 'spec360' }], colleague);
		doc = act(doc, [request('cancel_validation_request')]);
		expect(board(doc).standings['stack:a'].required).toEqual([lead, tech]);
		expect(board(doc).standings['stack:a'].validatedBy).toContainEqual(colleague);
	});

	it('keeps the request record but no longer waits on someone who lost project access [criterion:3b1c77a6]', () => {
		const doc = act(emptyRetrospecDocument(), [request()]);
		expect(board(doc, team.filter((member) => member.person.id !== colleague.id)).standings['stack:a'].required).toEqual([lead, tech]);
		expect(doc.validationRequests?.['stack:a']).toHaveLength(1);
	});

	it('never makes an unassigned reader a lead merely because they view a question [criterion:787a9fec]', () => {
		const doc = emptyRetrospecDocument();
		expect(canReviewElement(doc, elements[2], team, colleague, false)).toBe(false);
		expect(canReviewElement(doc, elements[0], team, tech, false)).toBe(true);
		const reviewed = act(doc, [{ op: 'validate', itemId: 'stack:a', title: 'Stack', tab: 'spec360' }], tech, true);
		const parsed = parseRetrospecDocument(JSON.parse(JSON.stringify(reviewed)));
		expect(validationLead(parsed, tech)).toBeNull();
		expect(canReviewElement(parsed, elements[2], team, tech, false)).toBe(false);
	});

	it('rechecks a reader assignment after a concurrent cancellation before saving [criterion:787a9fec]', () => {
		const doc = act(act(emptyRetrospecDocument(), [request()]), [request('cancel_validation_request')]);
		const result = applyRetrospecActs(doc, [{ op: 'validate', itemId: 'stack:a', title: 'Stack', tab: 'spec360' }], {
			actor: colleague, now: at, reviewOnly: true,
			canReview: (current, id) => canReviewElement(current, elements.find((element) => element.id === id), team, colleague, false)
		});
		expect(result).toEqual({ ok: false, reason: 'This question does not require your validation.' });
	});

	it('rechecks publication completeness if a concurrent reviewer request was added [criterion:787a9fec]', () => {
		const validate: RetrospecAct = { op: 'validate', itemId: 'stack:a', title: 'Stack', tab: 'spec360' };
		let doc = act(emptyRetrospecDocument(), [validate]);
		doc = act(doc, [validate], tech);
		const complete = (current: RetrospecDocument) => specValidationBoard({ doc: current, elements: [elements[0]], team, viewer: lead, baselines: [] }).complete;
		expect(complete(doc)).toBe(true);
		doc = act(doc, [request()]);
		const outcome = applyRetrospecActs(doc, [{ op: 'publish', baselineId: null }], { actor: lead, now: at, canPublish: complete });
		expect(outcome).toEqual({ ok: false, reason: 'Validate every element before validating the specification definitively.' });
	});
});
