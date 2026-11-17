import { describe, expect, it } from 'vitest';
import { parseSpecValidationActs } from './parse-spec-validation-acts';
import { parseSpecEdit } from './parse-spec-edit';
import { parseRetrospecActs } from '../retrospec/parse-retrospec-acts';

describe('the Specification 360° acts read from a request', () => {
	it('reads the whole-spec validation as one act, the server picking the elements', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'validate_waiting', itemIds: ['ignored'] }] })).toEqual({ ok: true, acts: [{ op: 'validate_waiting' }] });
	});

	it('reads the validation of all the features as one act too, and refuses any other scope', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'validate_waiting', scope: 'features' }] })).toEqual({ ok: true, acts: [{ op: 'validate_waiting', scope: 'features' }] });
		expect(parseSpecValidationActs({ acts: [{ op: 'validate_waiting', scope: 'users' }] })).toMatchObject({ ok: false });
	});

	it('reads validations, reminders, the definitive validation and the code decisions, ids only', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'validate', itemId: 'problem', title: 'ignored' }, { op: 'remind', itemId: 'problem', to: 'sarah@x.io' }] })).toEqual({
			ok: true,
			acts: [
				{ op: 'validate', itemId: 'problem' },
				{ op: 'remind', itemId: 'problem', to: 'sarah@x.io' }
			]
		});
		expect(parseSpecValidationActs({ acts: [{ op: 'keep_drift', key: 'f1|a1|rule:r1' }] })).toMatchObject({ ok: true });
	});

	it('refuses an unknown act, a missing id, and a definitive validation sent with anything else', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'publish' }] })).toMatchObject({ ok: false });
		expect(parseSpecValidationActs({ acts: [{ op: 'remind', itemId: 'x' }] })).toMatchObject({ ok: false });
		expect(parseSpecValidationActs({ acts: [{ op: 'finalize' }, { op: 'validate', itemId: 'x' }] })).toMatchObject({ ok: false });
		expect(parseSpecValidationActs({ acts: [] })).toMatchObject({ ok: false });
	});

	it('reads an edit on a known element, with its description and tags', () => {
		expect(parseSpecEdit({ op: 'edit', anchor: 'term:t1', text: 'Invoice', desc: 'A bill.', tags: ['Bill'] })).toEqual({
			ok: true,
			request: { op: 'edit', anchor: 'term:t1', text: 'Invoice', desc: 'A bill.', tags: ['Bill'] }
		});
		expect(parseSpecEdit({ op: 'edit', anchor: 'nowhere:x', text: 'A' })).toMatchObject({ ok: false });
		expect(parseSpecEdit({ op: 'edit', anchor: 'problem', text: 'A', tags: [3] })).toMatchObject({ ok: false });
		expect(parseSpecEdit({ op: 'add_user' })).toEqual({ ok: true, request: { op: 'add_user' } });
		expect(parseSpecEdit({ op: 'delete', anchor: 'core:c1' })).toMatchObject({ ok: true });
	});

	it('lets the retrospecification ask to be told when its analysis is ready, and read from both sources', () => {
		expect(parseRetrospecActs({ acts: [{ op: 'ask_notify' }, { op: 'cancel_notify' }, { op: 'choose_mode', mode: 'both' }] })).toMatchObject({ ok: true });
		expect(parseRetrospecActs({ acts: [{ op: 'remind', itemId: 'x', to: { id: 'a' } }] })).toMatchObject({ ok: false });
	});
});

describe('the product classification read with its summary', () => {
	const classification = { marketType: 'b2c', industry: 'legal', productType: null, formFactors: ['api'] };

	it('travels with the product summary only', () => {
		expect(parseSpecEdit({ op: 'edit', anchor: 'product', text: 'A tool', classification })).toEqual({
			ok: true,
			request: { op: 'edit', anchor: 'product', text: 'A tool', classification }
		});
		expect(parseSpecEdit({ op: 'edit', anchor: 'problem', text: 'x', classification })).toMatchObject({ ok: false });
	});

	it('refuses a shape that is not one', () => {
		expect(parseSpecEdit({ op: 'edit', anchor: 'product', text: 'x', classification: { ...classification, formFactors: 'api' } })).toMatchObject({ ok: false });
		expect(parseSpecEdit({ op: 'edit', anchor: 'product', text: 'x', classification: { ...classification, marketType: 3 } })).toMatchObject({ ok: false });
	});
});
