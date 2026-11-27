import { describe, expect, it } from 'vitest';
import { parseSpecValidationActs } from './parse-spec-validation-acts';

describe('the decisions on a code change read from the page [criterion:537e1684]', () => {
	it('reads accept, reject and undo by the change key alone', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'keep_drift', key: 'f|a|rule:r' }, { op: 'send_back_drift', key: 'f|a|rule:s' }, { op: 'undo_drift', key: ' f|a|rule:r ' }] })).toEqual({
			ok: true,
			acts: [
				{ op: 'keep_drift', key: 'f|a|rule:r' },
				{ op: 'send_back_drift', key: 'f|a|rule:s' },
				{ op: 'undo_drift', key: 'f|a|rule:r' }
			]
		});
	});

	it('refuses an undo that names no change', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'undo_drift' }] })).toEqual({ ok: false, reason: 'key is required.' });
	});
});

describe('a change requested reads as a rejection of one element [criterion:a4ef7658]', () => {
	it('reads the element it names', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'reject', itemId: ' rule:f:r1 ' }] })).toEqual({ ok: true, acts: [{ op: 'reject', itemId: 'rule:f:r1' }] });
	});

	it('refuses a rejection that names no element', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'reject' }] })).toEqual({ ok: false, reason: 'itemId is required.' });
	});
});

describe('choosing who leads the validation reads the person it names [action:34e2b66f]', () => {
	it('reads the person by their address', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'set_lead', to: ' sam@example.com ' }] })).toEqual({ ok: true, acts: [{ op: 'set_lead', to: 'sam@example.com' }] });
	});

	it('refuses a choice that names nobody', () => {
		expect(parseSpecValidationActs({ acts: [{ op: 'set_lead' }] })).toEqual({ ok: false, reason: 'to is required.' });
	});
});
