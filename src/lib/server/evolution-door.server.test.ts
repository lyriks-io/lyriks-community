import { describe, expect, it } from 'vitest';
import { accessNeededFor, onlyProjectSessionActs } from './evolution-door.server';

describe('the right the write door of the Evolution section asks of a batch (issue 38)', () => {
	it('asks only the right to read for what a viewer may do: comment, ask, rule, take back their own click, publish their exchange', () => {
		expect(accessNeededFor([{ op: 'post_on_field', requestId: 'r1', fieldPath: 'f', body: 'Why?' }])).toBe('read');
		expect(accessNeededFor([{ op: 'send_click', requestId: 'r1', clickKind: 'ask', body: 'Why?' }, { op: 'withdraw_click', requestId: 'r1', clickId: 'c1' }])).toBe('read');
		expect(accessNeededFor([{ op: 'validate_topic' }, { op: 'resolve_topic' }, { op: 'reopen_topic' }, { op: 'edit_message' }, { op: 'publish_exchange' }, { op: 'cancel_click' }])).toBe('read');
		// The AI acting for a viewer answers the viewer's question of Ask my AI.
		expect(accessNeededFor([{ op: 'answer_click', clickId: 'c1', text: 'Because.' }])).toBe('read');
	});

	it('asks the right to write as soon as one act of the batch writes the request', () => {
		expect(accessNeededFor([{ op: 'post_on_field' }, { op: 'update_need', requestId: 'r1', situation: 's' }])).toBe('write');
		expect(accessNeededFor([{ op: 'decide_thread_suggestion' }])).toBe('write');
		expect(accessNeededFor([{ kind: 'close_request', requestId: 'r1' }])).toBe('write');
		expect(accessNeededFor([{ op: 42 }])).toBe('write');
		expect(accessNeededFor([])).toBe('write');
	});

	it('reads the name from op, or from kind the way the behavior batch spells it', () => {
		expect(accessNeededFor([{ kind: 'post_on_field' }])).toBe('read');
		expect(accessNeededFor([{ op: 'add_draft_leaf', kind: 'add' }])).toBe('write');
	});

	it('knows a batch of answers to clicks made outside a request, the session of the whole project', () => {
		expect(onlyProjectSessionActs([{ op: 'answer_click', clickId: 'c1', text: 'x' }])).toBe(true);
		expect(onlyProjectSessionActs([{ op: 'answer_click' }, { op: 'post_on_field', requestId: 'r1' }])).toBe(false);
		expect(onlyProjectSessionActs([])).toBe(false);
	});
});
