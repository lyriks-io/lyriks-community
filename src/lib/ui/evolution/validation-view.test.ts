import { describe, expect, it } from 'vitest';
import { namesOf, stampName, validationView, STAMPS_SHOWN } from './validation-view';

const stamp = (name: string, ok: boolean, me = false) => ({ id: name, initials: name.slice(0, 2).toUpperCase(), title: `${name} · ${ok ? 'validated' : 'pending'}`, ok, me });
const base = { look: 'grey' as const, title: 'Validate', run: () => {}, stamps: [] as ReturnType<typeof stamp>[], settled: false };

describe('the one validation control reads its state in words [criterion:aba60be7]', () => {
	it('names people in one breath, then the others by their number', () => {
		expect(namesOf(['Ana'])).toBe('Ana');
		expect(namesOf(['Ana', 'Bob'])).toBe('Ana and Bob');
		expect(namesOf(['Ana', 'Bob', 'Chloe'])).toBe('Ana, Bob and Chloe');
		expect(namesOf(['Ana', 'Bob', 'C', 'D', 'E', 'F', 'G', 'H'])).toBe('Ana, Bob and 6 others');
		expect(stampName({ id: 'x', initials: 'AN', title: 'Ana Diaz · validated', ok: true })).toBe('Ana Diaz');
	});

	it('reads an Evolution control from its look: grey awaits the reader, mine waits on the others still unticked, done is validated', () => {
		expect(validationView(base).state).toBe('validate');
		expect(validationView({ ...base, look: 'mine', stamps: [stamp('Ana', true, true), stamp('Bob', false)] })).toMatchObject({ state: 'waiting', label: 'Waiting for 1' });
		expect(validationView({ ...base, look: 'mine', stamps: [stamp('Ana', true, true)] }).state).toBe('validated');
		expect(validationView({ ...base, look: 'done', settled: true }).state).toBe('validated');
	});

	it('takes the page word over the look when it gives one', () => {
		expect(validationView({ ...base, awaits: 'others', stamps: [stamp('Ana', false)] })).toMatchObject({ state: 'waiting', title: 'Waiting for Ana' });
		expect(validationView({ ...base, look: 'mine', awaits: null }).state).toBe('validated');
	});

	it('says a validation can be taken back only when it can', () => {
		const mine = validationView({ ...base, look: 'mine', withdraws: true, stamps: [stamp('Me', true, true), stamp('Bob', false)] });
		expect(mine.title).toBe('Waiting for Bob. Point a moment to withdraw yours');
		expect(validationView({ ...base, look: 'done', settled: true, withdraws: true, run: null }).title).toBe('Validated by everyone it waits on');
	});

	it('says why a validation is held rather than who it waits on [criterion:8fa75115]', () => {
		const held = validationView({ ...base, run: null, held: 'Its diagram is behind its texts', stamps: [stamp('Me', false, true), stamp('Bob', false)] });
		expect(held.state).toBe('validate');
		expect(held.title).toBe('Its diagram is behind its texts');
		expect(validationView({ ...base, held: null, stamps: [stamp('Me', false, true)] }).title).toBe('Waiting for your validation');
	});

	it(`draws at most ${STAMPS_SHOWN} people and folds the others into +N`, () => {
		const eight = validationView({ ...base, awaits: 'others', stamps: 'ABCDEFGH'.split('').map((n) => stamp(n, false)) });
		expect(eight.shown).toHaveLength(3);
		expect(eight.more).toBe(5);
		expect(eight.people.split('\n')).toHaveLength(8);
	});
});

describe('the people still awaited show before the rest folds into +N [criterion:aba60be7]', () => {
	it('draws the awaited people first, then those who validated', () => {
		const view = validationView({ ...base, awaits: 'others', stamps: [stamp('A', true), stamp('B', true), stamp('C', false), stamp('D', true), stamp('E', false)] });
		expect(view.shown.map((s) => s.id)).toEqual(['C', 'E', 'A']);
		expect(view.more).toBe(2);
	});
});
