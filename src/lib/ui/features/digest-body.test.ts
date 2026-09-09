import { describe, it, expect } from 'vitest';
import { digestBody } from './digest-body';

const DIGEST = `# Approval queue

> A manager's list of expenses awaiting decision.

## What you can do here

- **Open approval queue**: On screen: Approval queue.`;

describe('digestBody', () => {
	it('drops the title and the description the drawer already shows', () => {
		const out = digestBody(DIGEST, 'Approval queue', "A manager's list of expenses awaiting decision.");
		expect(out.startsWith('## What you can do here')).toBe(true);
		expect(out).toContain('Open approval queue');
	});

	it('keeps a blockquote that says something the drawer does not', () => {
		const out = digestBody(DIGEST, 'Approval queue', 'Something else entirely');
		expect(out.startsWith('> A manager')).toBe(true);
	});

	it('keeps the body when there is no preamble at all', () => {
		expect(digestBody('## What you can do here\n\n- One', 'X', 'Y')).toBe(
			'## What you can do here\n\n- One'
		);
	});

	it('drops the title when the drawer has no name to compare against', () => {
		expect(digestBody('# Anything\n\nBody', '', '')).toBe('Body');
	});
});
