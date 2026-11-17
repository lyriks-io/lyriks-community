import { describe, expect, it } from 'vitest';
import { mergePageChanges, pageChangeCount } from './page-edit';

describe('the page Save collects every existing editor', () => {
	it('keeps Briefing, Solution, question and diagram writes in the same request batch [unspa:280520a6:52c368a1:80636c3c]', () => {
		const changes = mergePageChanges([
			{ operations: [{ requestId: 'r', op: 'update_need', description: 'New wording', situation: '' }, { requestId: 'r', op: 'update_request', requester: 'Ana', origin: 'customer_feedback' }], patches: { description: { kind: 'text', value: 'New wording' } } },
			{ operations: [{ requestId: 'r', op: 'answer_step', step: 'technical_spec', question: 'data', answer: 'Order owns its lines' }], patches: { data: { kind: 'text', value: 'Order owns its lines' } } },
			{ operations: [{ requestId: 'r', op: 'resolve_question', questionId: 'q', resolution: 'answered', text: 'Yes' }], patches: {} },
			{ operations: [{ requestId: 'r', op: 'redraw_diagram', step: 'functional_spec', diagram: 'actor Customer' }], patches: { drawing: { kind: 'text', value: 'actor Customer' } } }
		]);
		expect(changes.operations).toHaveLength(5);
		expect(changes.operations[0]).toMatchObject({ situation: '' });
		expect(changes.operations.every((operation) => operation.requestId === 'r')).toBe(true);
		expect(changes.operations.at(-1)).toMatchObject({ op: 'redraw_diagram' });
		expect(Object.keys(changes.patches)).toEqual(['description', 'data', 'drawing']);
		expect(pageChangeCount(changes)).toBe(7);
	});
});
