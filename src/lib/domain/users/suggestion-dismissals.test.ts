import { describe, expect, it } from 'vitest';
import {
	isSuggestionDismissed,
	mergeSuggestionDismissals,
	suggestionKey,
	withSuggestionDismissed
} from './suggestion-dismissals';

describe('suggestion dismissals [criterion:b1242208]', () => {
	const at = '2026-10-15T12:00:00.000Z';

	it('records what was offered, why, when and by whom', () => {
		const out = withSuggestionDismissed([], { name: 'Site manager', rationale: 'Typed in the Foundation.' }, at, 'a@x.io');
		expect(out).toEqual([
			{ key: 'site manager', name: 'Site manager', rationale: 'Typed in the Foundation.', dismissedAt: at, dismissedBy: 'a@x.io' }
		]);
	});

	it('matches a later suggestion whatever its spelling', () => {
		const out = withSuggestionDismissed([], { name: 'Site manager', rationale: '' }, at, null);
		expect(isSuggestionDismissed(out, 'site_manager')).toBe(true);
		expect(isSuggestionDismissed(out, ' SITE  manager ')).toBe(true);
		expect(isSuggestionDismissed(out, 'Office manager')).toBe(false);
		expect(suggestionKey('office__manager')).toBe('office manager');
	});

	it('keeps the first decision when the same name is dismissed twice', () => {
		const first = withSuggestionDismissed([], { name: 'Site manager', rationale: '' }, at, 'a@x.io');
		expect(withSuggestionDismissed(first, { name: 'site_manager', rationale: '' }, 'later', 'b@x.io')).toEqual(first);
	});

	it('merges append-only: a write never drops a stored decision', () => {
		const stored = withSuggestionDismissed([], { name: 'Site manager', rationale: '' }, at, 'a@x.io');
		const incoming = withSuggestionDismissed([], { name: 'Employee', rationale: '' }, at, 'b@x.io');
		expect(mergeSuggestionDismissals(stored, incoming).map((d) => d.key)).toEqual(['site manager', 'employee']);
		expect(mergeSuggestionDismissals(stored, [])).toEqual(stored);
	});
});
