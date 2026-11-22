import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsBehaviorRepository } from './local-fs-behavior-repository.server';
import { LocalBehaviorPort } from './local-behavior-port.server';
import ts from 'typescript';

/** The modules a source file imports (static or dynamic) and how many times it calls fetch, read with the TypeScript parser. */
function reachesOut(fileName: string, text: string): { modules: string[]; fetches: number } {
	const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const modules: string[] = [];
	let fetches = 0;
	const visit = (node: ts.Node): void => {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
			modules.push(node.moduleSpecifier.text);
		} else if (ts.isCallExpression(node)) {
			const callee = node.expression;
			if (callee.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) modules.push(node.arguments[0].text);
			if ((ts.isIdentifier(callee) && callee.text === 'fetch') || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'fetch')) fetches += 1;
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return { modules, fetches };
}

const clock = { nowIso: () => '2026-01-01T00:00:00.000Z' };

/**
 * MAP proof: the behavior kernel is readable AND writable by the platform with the
 * unspa engine and the DPO turned OFF. This test spins up LocalBehaviorPort over a
 * real node:fs store in a temp dir — no unspa subprocess, no Lyriks-back, no HTTP —
 * and round-trips an edit. If this passes, the Minimal Autonomous Product can author
 * behavior standalone.
 */
describe('LocalBehaviorPort — MAP (engine-off) proof', () => {
	it('writes and reads the unspa-format kernel on real fs, no engines', async () => {
		const root = mkdtempSync(join(tmpdir(), 'kernel-'));
		const port = new LocalBehaviorPort(new LocalFsBehaviorRepository(root), clock);

		await port.apply('proj1', [
			{
				kind: 'upsertFeatureShell',
				featureId: 'feat1',
				name: 'Search',
				description: 'find things',
				tags: [{ type: 'core', value: 'Discovery' }]
			},
			{ kind: 'setProjectFeatureIds', featureIds: ['feat1'] },
			{ kind: 'setProjectTags', tags: [{ type: 'core', value: 'Discovery' }] }
		]);

		// The canonical files exist on disk in the Unspaghettit layout.
		expect(existsSync(join(root, 'proj1', 'proj1.project.json'))).toBe(true);
		expect(existsSync(join(root, 'proj1', 'feat1.feature.json'))).toBe(true);
		const onDisk = JSON.parse(readFileSync(join(root, 'proj1', 'feat1.feature.json'), 'utf8'));
		expect(onDisk.format).toBe('unspaghettit');
		expect(onDisk.feature.featureInvariants).toEqual([]);

		// Read back through the port.
		const feat = await port.readFeature('proj1', 'feat1');
		expect((feat!.feature as { name: string }).name).toBe('Search');
		const project = await port.readProject('proj1');
		expect(project!.project.featureIds).toEqual(['feat1']);
		expect(project!.project.tags).toEqual([{ type: 'core', value: 'Discovery' }]);
	});

	it('air-gap guard: the write path imports neither the unspa engine nor the back client, and calls out nowhere', () => {
		for (const file of ['local-behavior-port.server.ts', 'local-fs-behavior-repository.server.ts']) {
			const { modules, fetches } = reachesOut(file, readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));
			expect(modules.filter((m) => /unspaghettit|lyriks-back/.test(m)), file).toEqual([]);
			expect(fetches, file).toBe(0);
		}
	});

	it('air-gap guard: sees an import or a call out however it is written', () => {
		const snippet = `import type { A } from 'x';\nconst m = await import('unspaghettit/engine');\nawait globalThis.fetch('http://back');\nfetch(url);`;
		expect(reachesOut('snippet.ts', snippet)).toEqual({ modules: ['x', 'unspaghettit/engine'], fetches: 2 });
	});
});
