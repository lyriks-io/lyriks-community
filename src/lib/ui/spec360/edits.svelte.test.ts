import { describe, expect, it } from 'vitest';
import { SpecEdits } from './edits.svelte';

describe('a block being edited shows only its editor [criterion:42cb9176]', () => {
	it('leaves the element being edited out of the one-click validations until Cancel', () => {
		const edits = new SpecEdits('p', () => true);
		const anchors = ['problem', 'target'];
		expect(edits.notEditing(anchors)).toEqual(anchors);
		edits.open('problem', { text: 'Today' });
		expect(edits.notEditing(anchors)).toEqual(['target']);
		edits.cancel();
		expect(edits.notEditing(anchors)).toEqual(anchors);
	});
});

describe('the Edit mode holds what is typed until Save [criterion:41514698]', () => {
	const read = { text: 'Selling', desc: 'Everything that sells.' };

	it('holds a changed text whole, marks only the field that changed, and counts the elements waiting', () => {
		const edits = new SpecEdits('p', () => true);
		edits.stage('core:c1', read, 'desc', 'Everything that sells, edited.');
		expect(edits.stagedCount).toBe(1);
		expect(edits.current('core:c1', read)).toEqual({ text: 'Selling', desc: 'Everything that sells, edited.' });
		expect(edits.changed('core:c1', read, 'desc')).toBe(true);
		expect(edits.changed('core:c1', read, 'text')).toBe(false);
	});

	it('holds nothing once a text is typed back to what the page shows', () => {
		const edits = new SpecEdits('p', () => true);
		edits.stage('core:c1', read, 'text', 'Selling!');
		edits.stage('core:c1', read, 'text', 'Selling');
		expect(edits.stagedCount).toBe(0);
		expect(edits.current('core:c1', read)).toEqual(read);
	});

	it('puts every text back on Discard', () => {
		const edits = new SpecEdits('p', () => true);
		edits.stage('core:c1', read, 'text', 'Sales');
		edits.stage('problem', { text: 'Too slow' }, 'text', 'Far too slow');
		expect(edits.stagedCount).toBe(2);
		edits.discardStaged();
		expect(edits.stagedCount).toBe(0);
		expect(edits.current('problem', { text: 'Too slow' }).text).toBe('Too slow');
	});

	it('opens an element\'s editor on what was typed and not saved yet', () => {
		const edits = new SpecEdits('p', () => true);
		edits.stage('core:c1', read, 'text', 'Sales');
		edits.open('core:c1', read);
		expect(edits.text).toBe('Sales');
	});
});

describe('a list of texts is held as its fields in the Edit mode [criterion:41514698]', () => {
	const read = { text: 'Too slow', tags: ['Pages load slowly', 'Search times out'] };

	it('holds a symptom changed, added blank to be typed in, or removed, and nothing once back as it was', () => {
		const edits = new SpecEdits('p', () => true);
		edits.stageTags('problem', read, ['Pages load slowly', 'Search times out', '']);
		expect(edits.changedTags('problem', read)).toBe(true);
		expect(edits.current('problem', read).tags).toEqual(['Pages load slowly', 'Search times out', '']);
		edits.stageTags('problem', read, ['Search times out']);
		expect(edits.current('problem', read).tags).toEqual(['Search times out']);
		edits.stageTags('problem', read, ['Pages load slowly', 'Search times out']);
		expect(edits.stagedCount).toBe(0);
	});

	it('holds the text and the symptoms of one element together', () => {
		const edits = new SpecEdits('p', () => true);
		edits.stage('problem', read, 'text', 'Far too slow');
		edits.stageTags('problem', read, ['Search times out']);
		expect(edits.current('problem', read)).toEqual({ text: 'Far too slow', tags: ['Search times out'] });
		expect(edits.stagedCount).toBe(1);
	});
});

describe('the way out of the Edit mode says what it does [criterion:41514698]', () => {
	it('reads Stop editing with nothing held, Cancel editing once a change waits, and Stop editing again once they are dropped', async () => {
		const { leaveLabel } = await import('./leave-edit');
		const edits = new SpecEdits('p', () => true);
		expect(leaveLabel(edits)).toBe('Stop editing');
		edits.stage('core:c1', { text: 'Selling' }, 'text', 'Sales');
		expect(leaveLabel(edits)).toBe('Cancel editing');
		edits.discardStaged();
		expect(leaveLabel(edits)).toBe('Stop editing');
	});
});
