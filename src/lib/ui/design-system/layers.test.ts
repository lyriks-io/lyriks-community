import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The z-index of the outermost fixed layer a component draws, read from its markup. */
function layerOf(file: string): number {
	const markup = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
	const z = /class="fixed [^"]*\bz-(?:\[(\d+)\]|(\d+))/.exec(markup);
	if (!z) throw new Error(`${file} draws no fixed layer`);
	return Number(z[1] ?? z[2]);
}

describe('a question asked from a drawer is answered on top of it [criterion:40d632f9]', () => {
	it('draws the confirmation above every drawer and dialog it can be asked from', () => {
		const confirm = layerOf('./ConfirmHost.svelte');
		// Found on lab on 2026-11-24: Delete in the Versions drawer opened its confirmation under the drawer, out of reach.
		expect(confirm).toBeGreaterThan(layerOf('./SideDrawer.svelte'));
		expect(confirm).toBeGreaterThan(layerOf('../shell/FirstStepsDialog.svelte'));
	});
});
