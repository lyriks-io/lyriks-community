import { describe, expect, it } from 'vitest';
import { readableName } from './readable-name';

describe('a name written as a code identifier reads in words [criterion:ac-leaf-ac-tree-readable-actions]', () => {
	it('splits a camelCase identifier into capitalised words', () => {
		expect(readableName('searchRooms')).toBe('Search Rooms');
		expect(readableName('selectRoom')).toBe('Select Room');
	});

	it('splits snake_case and kebab-case identifiers', () => {
		expect(readableName('select_room')).toBe('Select Room');
		expect(readableName('select-room')).toBe('Select Room');
	});

	it('splits a PascalCase screen name and a dotted event name', () => {
		expect(readableName('RiskAnalysis')).toBe('Risk Analysis');
		expect(readableName('collection.completed')).toBe('Collection Completed');
		expect(readableName('await_risk_inputs')).toBe('Await Risk Inputs');
	});

	it('keeps an acronym whole', () => {
		expect(readableName('fetchHTTPStatus')).toBe('Fetch HTTP Status');
	});

	it('capitalises a lone lowercase word', () => {
		expect(readableName('search')).toBe('Search');
	});

	it('leaves a name already written in words as authored', () => {
		expect(readableName('Open a core')).toBe('Open a core');
		expect(readableName('Add a feature under a pillar')).toBe('Add a feature under a pillar');
	});

	it('leaves an empty name empty', () => {
		expect(readableName('')).toBe('');
	});
});
