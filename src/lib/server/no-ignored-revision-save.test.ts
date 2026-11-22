import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * A save made under an expected revision answers null when the section moved
 * meanwhile: nothing was written. Ignoring that answer reports a write that
 * never happened (the held index entries of an Evolution request were lost
 * that way). Every such save must use what it answers.
 *
 * Read with the TypeScript parser, so a call written over several lines, or
 * behind `void`, is seen like any other.
 */
function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.ts$/.test(name) && !/\.(test|fixture)\.ts$/.test(name) ? [path] : [];
	});
}

const SAVES = /^(save\w*|execute)$/;

/** Whether an argument names a revision the store must match (anything but a literal null). */
function namesRevision(arg: ts.Expression): boolean {
	if (!ts.isObjectLiteralExpression(arg)) return false;
	return arg.properties.some(
		(p) =>
			(ts.isPropertyAssignment(p) && p.name.getText() === 'expectedRevision' && p.initializer.kind !== ts.SyntaxKind.NullKeyword) ||
			(ts.isShorthandPropertyAssignment(p) && p.name.text === 'expectedRevision')
	);
}

/** Every statement that makes a save under a revision and drops its answer, as `line: text`. */
function ignoredRevisionSaves(fileName: string, text: string): string[] {
	const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const found: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isExpressionStatement(node)) {
			let expression = node.expression;
			while (ts.isAwaitExpression(expression) || ts.isVoidExpression(expression) || ts.isParenthesizedExpression(expression)) {
				expression = expression.expression;
			}
			if (
				ts.isCallExpression(expression) &&
				ts.isPropertyAccessExpression(expression.expression) &&
				SAVES.test(expression.expression.name.text) &&
				expression.arguments.some(namesRevision)
			) {
				const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
				found.push(`${fileName}:${line}: ${node.getText().replace(/\s+/g, ' ').slice(0, 140)}`);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

describe('a save under an expected revision is never ignored', () => {
	it('sees a dropped answer however the call is written, and a used one as used', () => {
		const snippet = `
			async function f(store, rev) {
				await store.saveDraft(
					draft,
					{ expectedRevision: rev, origin: null }
				);
				void store.execute(draft, { expectedRevision });
				const saved = await store.saveDraft(draft, { expectedRevision: rev });
				await store.saveDraft(draft, { expectedRevision: null });
				return saved;
			}`;
		expect(ignoredRevisionSaves('snippet.ts', snippet).map((f) => f.split(':')[1])).toEqual(['3', '7']);
	});

	it('uses the answer of every save that names a revision', () => {
		// Only a file that names the option can make such a save: the others are not parsed at all.
		const ignored = [...sources('src/lib'), ...sources('src/routes')].flatMap((file) => {
			const text = readFileSync(file, 'utf8');
			return text.includes('expectedRevision') ? ignoredRevisionSaves(file, text) : [];
		});
		expect(ignored, 'A save under a revision answers null when refused: check it, retry or report it.').toEqual([]);
	}, 60_000);
});
