import { describe, expect, it } from 'vitest';
import { chooseKernelFeatures } from './choose-kernel-features';

const file = (fileName: string, id: string, marker: string) => ({
	id,
	fileName,
	feature: { id, name: marker }
});

describe('chooseKernelFeatures', () => {
	it('keeps every distinct id, in folder order', () => {
		const chosen = chooseKernelFeatures([
			file('feat-a.feature.json', 'feat-a', 'A'),
			file('feat-b.feature.json', 'feat-b', 'B')
		]);

		expect(chosen.features.map((f) => f.id)).toEqual(['feat-a', 'feat-b']);
		expect(chosen.droppedTwins).toEqual([]);
	});

	it('prefers the id-named file over a slug-named twin, whichever came first', () => {
		const slugFirst = chooseKernelFeatures([
			file('login.feature.json', 'feat-login', 'slug'),
			file('feat-login.feature.json', 'feat-login', 'id-named')
		]);
		const idFirst = chooseKernelFeatures([
			file('feat-login.feature.json', 'feat-login', 'id-named'),
			file('login.feature.json', 'feat-login', 'slug')
		]);

		// The reader's fast path is the id-named file, so that is the content the
		// source install serves, and the only content a faithful copy can carry.
		expect(slugFirst.features).toEqual([{ id: 'feat-login', feature: { id: 'feat-login', name: 'id-named' } }]);
		expect(idFirst.features).toEqual(slugFirst.features);
		expect(slugFirst.droppedTwins).toEqual(['login.feature.json (feat-login)']);
		expect(idFirst.droppedTwins).toEqual(['login.feature.json (feat-login)']);
	});

	it('keeps the first of two slug-named twins, and reports the other', () => {
		const chosen = chooseKernelFeatures([
			file('submit-report.feature.json', 'feat-submit', 'first'),
			file('submit-report-old.feature.json', 'feat-submit', 'second')
		]);

		expect(chosen.features).toEqual([{ id: 'feat-submit', feature: { id: 'feat-submit', name: 'first' } }]);
		expect(chosen.droppedTwins).toEqual(['submit-report-old.feature.json (feat-submit)']);
	});

	it('reports every loser when a folder holds three files for one id', () => {
		const chosen = chooseKernelFeatures([
			file('a.feature.json', 'feat-x', 'a'),
			file('b.feature.json', 'feat-x', 'b'),
			file('feat-x.feature.json', 'feat-x', 'id-named')
		]);

		expect(chosen.features).toEqual([{ id: 'feat-x', feature: { id: 'feat-x', name: 'id-named' } }]);
		expect(chosen.droppedTwins).toEqual(['b.feature.json (feat-x)', 'a.feature.json (feat-x)']);
	});
});
