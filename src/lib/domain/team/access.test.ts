import { describe, expect, it } from 'vitest';
import { GRANTED_ACCESSES, accessLabel } from './access';

describe('the access a workspace role reads under [criterion:7d5d098a]', () => {
	it('reads the role designer Editor, so nobody takes it for the Design job', () => {
		expect(accessLabel('designer')).toBe('Editor');
		expect(GRANTED_ACCESSES.map(accessLabel)).toEqual(['Admin', 'Editor', 'Viewer']);
		expect(accessLabel('owner')).toBe('Owner');
	});

	it('keeps a role it does not know as stored', () => {
		expect(accessLabel('mcp')).toBe('mcp');
	});
});
