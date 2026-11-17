import { describe, it, expect } from 'vitest';
import { parseExperienceBuilder } from './parse-experience-builder';
import type { ExperiencePrototype } from '$domain/experience';

const noPrototype: ExperiencePrototype = { screens: [], elements: [], entryScreenId: null };

/** A minimal raw builder holding one group whose appearance is under test. */
function rawBuilderWith(appearance: unknown) {
	return {
		nodes: {
			root: {
				id: 'root',
				surfaceId: 'scr-a',
				parentId: null,
				kind: 'group',
				label: 'Bar',
				childIds: [],
				flex: {},
				appearance
			}
		},
		screenRoots: { 'scr-a': 'root' }
	};
}

describe('parseExperienceBuilder: appearance.gradient', () => {
	it('keeps a valid gradient (the renderer paints it over `background`)', () => {
		const b = parseExperienceBuilder(
			rawBuilderWith({ gradient: { angle: 135, from: '#7c3aed', to: '#ec4899' } }),
			noPrototype
		);
		expect(b.nodes.root.appearance?.gradient).toEqual({
			angle: 135,
			from: '#7c3aed',
			to: '#ec4899'
		});
	});

	it('drops a half-authored gradient (a lone stop must not paint)', () => {
		const b = parseExperienceBuilder(rawBuilderWith({ gradient: { from: '#7c3aed' } }), noPrototype);
		expect(b.nodes.root.appearance?.gradient).toBeUndefined();
	});

	it('rejects non-hex stops, same contract as every other appearance color', () => {
		const b = parseExperienceBuilder(
			rawBuilderWith({ gradient: { from: 'rgba(255,255,255,0.2)', to: '#ec4899' } }),
			noPrototype
		);
		expect(b.nodes.root.appearance?.gradient).toBeUndefined();
	});
});
