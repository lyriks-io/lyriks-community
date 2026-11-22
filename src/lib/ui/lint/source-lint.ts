import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'svelte/compiler';
import ts from 'typescript';

/**
 * The app's own code, parsed, for the architecture lints of the UI (*.lint.test.ts): what a file imports, the
 * components its markup uses, the strings a person may read, the string values its objects set, the CSS it
 * declares. A component is read with the Svelte compiler, a module with the TypeScript parser, so a comment never
 * counts as code and an identifier never reads as text. Test files, declarations and the linked Enterprise copies
 * (src/lib/ee, src/routes/(ee): copies of ee/) are left out.
 */

export const SRC = join(process.cwd(), 'src');

export interface ParsedSource {
	/** Relative to src/. */
	readonly path: string;
	readonly imports: readonly { readonly from: string; readonly names: readonly string[] }[];
	/** Strings a person may read: string literals, the text of template literals, the text and attribute values of the markup. */
	readonly strings: readonly { readonly text: string; readonly line: number; readonly markup: boolean }[];
	/** Object properties set to a string: `{ behavior: 'smooth' }`. */
	readonly properties: readonly { readonly key: string; readonly value: string; readonly line: number }[];
	/** Components the markup uses: each use, by the names of the attributes it is given. */
	readonly components: ReadonlyMap<string, readonly (readonly string[])[]>;
	/** CSS declarations of the component's styles, or of a stylesheet. */
	readonly declarations: readonly { readonly property: string; readonly value: string; readonly line: number }[];
	/** Method calls on a named object, by their dotted name: `crypto.randomUUID()` gives `crypto.randomUUID`. */
	readonly calls: readonly { readonly callee: string; readonly line: number }[];
}

const LINKED_COPIES = [join('lib', 'ee'), join('routes', '(ee)')];

/** Every .svelte and .ts file of the app under `dir`. */
export function appFiles(dir = SRC): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return LINKED_COPIES.includes(relative(SRC, path)) ? [] : appFiles(path);
		return /\.(svelte|ts)$/.test(entry.name) && !/\.(test|spec)\.ts$|\.d\.ts$/.test(entry.name) ? [path] : [];
	});
}

const lineAt = (text: string, offset: number) => text.slice(0, offset).split('\n').length;
const cache = new Map<string, ParsedSource>();

/** A file of the app, parsed once. */
export function parsed(path: string): ParsedSource {
	let read = cache.get(path);
	if (!read) {
		const text = readFileSync(path, 'utf8');
		read = path.endsWith('.svelte') ? parseComponent(path, text) : path.endsWith('.css') ? parseStylesheet(path, text) : parseModule(path, text);
		cache.set(path, read);
	}
	return read;
}

type Node = { type?: string; start?: number; [key: string]: unknown };
const isNode = (value: unknown): value is Node => !!value && typeof value === 'object';

function walk(node: unknown, visit: (node: Node, parent: Node | null) => void, parent: Node | null = null): void {
	if (Array.isArray(node)) return node.forEach((child) => walk(child, visit, parent));
	if (!isNode(node)) return;
	if (typeof node.type === 'string') visit(node, parent);
	for (const [key, child] of Object.entries(node)) if (key !== 'parent' && key !== 'metadata') walk(child, visit, typeof node.type === 'string' ? node : parent);
}

function parseComponent(path: string, text: string): ParsedSource {
	const ast = parse(text, { modern: true }) as unknown as Node;
	const imports: { from: string; names: string[] }[] = [];
	const strings: { text: string; line: number; markup: boolean }[] = [];
	const properties: { key: string; value: string; line: number }[] = [];
	const components = new Map<string, string[][]>();
	const calls: { callee: string; line: number }[] = [];
	const at = (node: Node) => lineAt(text, node.start ?? 0);
	const scripts = [ast.instance, ast.module].filter(isNode);
	for (const script of scripts)
		walk(script, (node, parent) => {
			if (node.type === 'ImportDeclaration') {
				const specifiers = (node.specifiers as Node[]).map((s) => String((s.local as Node).name));
				imports.push({ from: String((node.source as Node).value), names: specifiers });
			}
			collect(node, parent, false);
		});
	walk(ast.fragment, (node, parent) => {
		if (node.type === 'Component') {
			const given = (node.attributes as Node[]).map((a) => String(a.name ?? a.type));
			components.set(String(node.name), [...(components.get(String(node.name)) ?? []), given]);
		}
		if (node.type === 'Text') strings.push({ text: String(node.data), line: at(node), markup: true });
		collect(node, parent, true);
	});
	function collect(node: Node, parent: Node | null, markup: boolean) {
		const fromModule = parent?.type === 'ImportDeclaration' || parent?.type === 'ImportExpression' || parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportAllDeclaration';
		if (node.type === 'Literal' && typeof node.value === 'string' && !fromModule) strings.push({ text: node.value, line: at(node), markup });
		if (node.type === 'TemplateElement') strings.push({ text: String((node.value as { cooked: string }).cooked ?? ''), line: at(node), markup });
		if (node.type === 'Property' && isNode(node.value) && node.value.type === 'Literal' && typeof node.value.value === 'string') {
			const key = node.key as Node;
			properties.push({ key: String(key.type === 'Identifier' ? key.name : key.value), value: node.value.value, line: at(node) });
		}
		const callee = node.type === 'CallExpression' && isNode(node.callee) ? node.callee : null;
		if (callee?.type === 'MemberExpression' && isNode(callee.object) && callee.object.type === 'Identifier' && isNode(callee.property) && callee.property.type === 'Identifier')
			calls.push({ callee: `${callee.object.name}.${callee.property.name}`, line: at(node) });
	}
	return { path: relative(SRC, path), imports, strings, properties, components, declarations: declarationsOf(ast.css, text, 0), calls };
}

function declarationsOf(css: unknown, text: string, shift: number) {
	const found: { property: string; value: string; line: number }[] = [];
	walk(css, (node) => {
		if (node.type === 'Declaration') found.push({ property: String(node.property), value: String(node.value), line: lineAt(text, (node.start ?? 0) - shift) });
	});
	return found;
}

/** A stylesheet (app.css), read as a component's style block. */
function parseStylesheet(path: string, text: string): ParsedSource {
	const open = '<style>';
	const ast = parse(`${open}${text}</style>`, { modern: true }) as unknown as Node;
	return { path: relative(SRC, path), imports: [], strings: [], properties: [], components: new Map(), declarations: declarationsOf(ast.css, text, open.length), calls: [] };
}

function parseModule(path: string, text: string): ParsedSource {
	const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const imports: { from: string; names: string[] }[] = [];
	const strings: { text: string; line: number; markup: boolean }[] = [];
	const properties: { key: string; value: string; line: number }[] = [];
	const calls: { callee: string; line: number }[] = [];
	const at = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
	const isModuleName = (node: ts.Node) =>
		ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) || ts.isExternalModuleReference(node.parent) || (ts.isCallExpression(node.parent) && node.parent.expression.kind === ts.SyntaxKind.ImportKeyword) || ts.isLiteralTypeNode(node.parent);
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			const clause = node.importClause;
			const names = [
				...(clause?.name ? [clause.name.text] : []),
				...(clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements.map((e) => e.name.text) : []),
				...(clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings) ? [clause.namedBindings.name.text] : [])
			];
			imports.push({ from: node.moduleSpecifier.text, names });
		}
		if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isModuleName(node)) strings.push({ text: node.text, line: at(node), markup: false });
		if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) strings.push({ text: node.text, line: at(node), markup: false });
		if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
			const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : node.name.getText(file);
			properties.push({ key, value: node.initializer.text, line: at(node) });
		}
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression))
			calls.push({ callee: `${node.expression.expression.text}.${node.expression.name.text}`, line: at(node) });
		ts.forEachChild(node, visit);
	};
	visit(file);
	return { path: relative(SRC, path), imports, strings, properties, components: new Map(), declarations: [], calls };
}
