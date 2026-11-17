import { describe, expect, it } from 'vitest';
import { counterWheels } from './counter-wheels';

describe('the picked count turns its wheels like a game score [criterion:3f977777]', () => {
	it('rolls only the digit that changed, upward as the count grows', () => {
		expect(counterWheels(12, 13)).toEqual([
			{ place: 1, now: '1', was: null, up: true },
			{ place: 0, now: '3', was: '2', up: true }
		]);
	});

	it('counts the first point in from 0', () => {
		expect(counterWheels(0, 1)).toEqual([{ place: 0, now: '1', was: '0', up: true }]);
	});

	it('brings a new digit in from blank as the number widens, the units keeping their place', () => {
		expect(counterWheels(9, 10)).toEqual([
			{ place: 1, now: '1', was: '', up: true },
			{ place: 0, now: '0', was: '9', up: true }
		]);
	});

	it('rolls back down as the count shrinks, a lost digit going at once', () => {
		expect(counterWheels(10, 9)).toEqual([{ place: 0, now: '9', was: '0', up: false }]);
	});

	it('turns nothing under reduced motion, nor when the count stays', () => {
		expect(counterWheels(3, 4, true)).toEqual([{ place: 0, now: '4', was: null, up: true }]);
		expect(counterWheels(7, 7)).toEqual([{ place: 0, now: '7', was: null, up: true }]);
	});
});
