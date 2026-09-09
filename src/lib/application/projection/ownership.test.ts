import { describe, expect, it } from 'vitest';
import { isLyriksOwned, isTombstonable, nodeOrigin } from './ownership';

describe('node ownership', () => {
	it('recognises Lyriks-minted ids by their prefix convention', () => {
		for (const id of ['srf-j1', 'srf-screen-s1', 'act-write-e1', 'per-r1', 'ent-e1', 'eff-ui-e1-t1', 'ac-edge-x']) {
			expect(isLyriksOwned(id), id).toBe(true);
			expect(nodeOrigin(id), id).toBe('lyriks');
		}
	});

	it('treats engine-minted (hex / arbitrary) ids as engine-owned', () => {
		for (const id of ['fc4f27f2', 'a1b2c3d4', 'feature-x', undefined]) {
			expect(isLyriksOwned(id as string | undefined), String(id)).toBe(false);
			expect(nodeOrigin(id as string | undefined), String(id)).toBe('engine');
		}
	});

	it('only allows a tombstone to suppress a Lyriks-owned node', () => {
		expect(isTombstonable('srf-j1')).toBe(true);
		expect(isTombstonable('fc4f27f2')).toBe(false); // engine node — never tombstonable
	});
});
