import type { CoherenceFinding, EvolutionRequest } from './draft';
import { stableId } from './ids';
import { withoutQuotations } from './quotations';
import { quoteName, type SpecLanguage } from '$domain/language';
import { ELEMENT_PATH_PREFIX } from './spec-actions';

/**
 * The pages of the product's spec a request changes besides its features and
 * its tables (ac-evo-draft-section, -section-read, -section-landing).
 *
 * A section change aims at a page of the Specification 360 as the design names
 * it (At a glance, Users and permissions, Experience, Requirements,
 * Architecture, Glossary) and may only touch what that page shows: a change
 * nobody can read on the spec is a change nobody can validate. Features and the
 * Data map keep their own drafts; Health is computed. Its edits take the
 * vocabulary of patch_section and are held on the request, applied to the
 * sections behind the page only when the change lands.
 *
 * The sections are read here as plain data: this module never knows a
 * section's own types, so the server parses and saves each one through its own
 * boundary, exactly as its page does. The wire id of a section stays inside the
 * operations; every word a person reads names the page.
 */
export const SECTION_DRAFT_PREFIX = 'section:';

/** The sections behind the pages a section change edits. Internal: a person never reads these ids. */
export const DRAFTABLE_SECTIONS = ['foundation', 'users', 'experience', 'architecture', 'glossary'] as const;
export type DraftableSection = (typeof DRAFTABLE_SECTIONS)[number];
export const isDraftableSection = (v: unknown): v is DraftableSection =>
	typeof v === 'string' && (DRAFTABLE_SECTIONS as readonly string[]).includes(v);

/** What a page shows: one place of one section, under the label the page gives it. */
export interface SpecPagePlace {
	readonly section: DraftableSection;
	/** The path inside the section, as the page reads it; an edit writes at it or under it. */
	readonly path: string;
	readonly label: string;
}

export const SPEC_PAGE_KEYS = ['glance', 'users', 'experience', 'requirements', 'architecture', 'glossary'] as const;
export type SpecPage = (typeof SPEC_PAGE_KEYS)[number];
export const isSpecPage = (v: unknown): v is SpecPage => typeof v === 'string' && (SPEC_PAGE_KEYS as readonly string[]).includes(v);

/**
 * The pages a section change aims at, with what each one shows, read off the
 * Specification 360 loaders (spec360-read.server.ts): At a glance reads the
 * product summary, the current and the target situation; Requirements the rows
 * of its groups and the technical constraints; and so on.
 */
export const SPEC_PAGES: Readonly<Record<SpecPage, { readonly name: string; readonly places: readonly SpecPagePlace[] }>> = {
	glance: {
		name: 'At a glance',
		places: [
			{ section: 'foundation', path: 'identity.brief', label: 'Product summary' },
			{ section: 'foundation', path: 'identity.industry', label: 'Product summary · Industry' },
			{ section: 'foundation', path: 'identity.productType', label: 'Product summary · Product type' },
			{ section: 'foundation', path: 'identity.formFactors', label: 'Product summary · Form factors' },
			{ section: 'foundation', path: 'definition.market.marketType', label: 'Product summary · Market' },
			{ section: 'foundation', path: 'definition.businessObjective.mainProblem', label: 'Current situation' },
			{ section: 'foundation', path: 'definition.businessObjective.painPoints', label: 'Current situation · Symptoms' },
			{ section: 'foundation', path: 'definition.businessObjective.painPointLinks', label: 'Current situation · Symptoms' },
			{ section: 'foundation', path: 'definition.businessObjective.expectedOutcome', label: 'Target situation' },
			{ section: 'foundation', path: 'definition.businessObjective.kpis', label: 'Target situation · Outcomes' }
		]
	},
	users: {
		name: 'Users and permissions',
		places: [
			{ section: 'users', path: 'roles', label: 'Users' },
			{ section: 'users', path: 'permissions', label: 'Permissions' }
		]
	},
	experience: {
		name: 'Experience',
		places: [
			{ section: 'experience', path: 'journeys', label: 'Journeys' },
			{ section: 'experience', path: 'steps', label: 'Journey steps' },
			{ section: 'experience', path: 'screens', label: 'Screens' },
			{ section: 'experience', path: 'components', label: 'Components' }
		]
	},
	requirements: {
		name: 'Requirements',
		places: [
			{ section: 'foundation', path: 'definition.technical.compatibilities', label: 'Platforms' },
			{ section: 'foundation', path: 'operations.quality.browsers', label: 'Browsers' },
			{ section: 'foundation', path: 'identity.formFactors', label: 'Form factors' },
			{ section: 'foundation', path: 'definition.market.languages', label: 'Languages' },
			{ section: 'foundation', path: 'operations.i18n.primaryLocale', label: 'Primary language' },
			{ section: 'foundation', path: 'operations.i18n.locales', label: 'Languages' },
			{ section: 'foundation', path: 'operations.i18n.dateFormat', label: 'Date format' },
			{ section: 'foundation', path: 'operations.i18n.numberFormat', label: 'Number format' },
			{ section: 'foundation', path: 'operations.i18n.currency', label: 'Currency' },
			{ section: 'foundation', path: 'operations.i18n.timezone', label: 'Time zone' },
			{ section: 'foundation', path: 'definition.security.authentication', label: 'Authentication' },
			{ section: 'foundation', path: 'definition.security.authorization', label: 'Authorization' },
			{ section: 'foundation', path: 'definition.security.encryption', label: 'Encryption' },
			{ section: 'foundation', path: 'definition.market.regulations', label: 'Regulations' },
			{ section: 'foundation', path: 'definition.security.expectedCertifications', label: 'Certifications' },
			{ section: 'foundation', path: 'operations.quality.a11yStandards', label: 'Accessibility' },
			{ section: 'architecture', path: 'constraints', label: 'Technical constraints' }
		]
	},
	architecture: {
		name: 'Architecture',
		places: [{ section: 'architecture', path: 'techChoices', label: 'Stack' }]
	},
	glossary: {
		name: 'Glossary',
		places: [{ section: 'glossary', path: 'terms', label: 'Terms' }]
	}
};

/**
 * A section change is validated on the Specification like a path of the
 * journey: on a synthetic field whose value is the change's fingerprint, so an
 * edit changed after a person validated it reads stale (ac-evo-draft-section-read).
 */
export const SECTION_CHANGE_PATH_PREFIX = `${ELEMENT_PATH_PREFIX}section.`;
export const sectionChangeKey = (draft: Pick<SectionDraft, 'id'>): string => `${SECTION_CHANGE_PATH_PREFIX}${draft.id.slice(SECTION_DRAFT_PREFIX.length)}`;
export const isSectionChangeKey = (key: string): boolean => key.startsWith(SECTION_CHANGE_PATH_PREFIX);
export const sectionChangeFingerprint = (draft: Pick<SectionDraft, 'page' | 'summary' | 'edits'>): string =>
	JSON.stringify({ page: draft.page, summary: draft.summary, edits: draft.edits });
/** The change a synthetic field stands for. */
export const sectionDraftOfKey = (drafts: readonly SectionDraft[] | undefined, key: string): SectionDraft | undefined =>
	(drafts ?? []).find((d) => sectionChangeKey(d) === key);

/** Why a page takes no section change, said to whoever asked for one. */
export function notDraftablePageReason(page: string): string {
	if (page === 'features') return 'A feature is changed by a feature draft (add_draft_leaf).';
	if (page === 'data-map' || page === 'data') return 'The Data map is changed by a data draft (add_data_draft).';
	if (page === 'health') return 'Health is computed from the spec: no request changes it.';
	return `"${page}" is not a page of the spec. The pages a section change aims at: ${SPEC_PAGE_KEYS.map((k) => `${k} (${SPEC_PAGES[k].name})`).join(', ')}.`;
}

export const SECTION_EDIT_OPS = ['set', 'merge', 'append', 'remove', 'add_to_set', 'remove_from_set', 'append_text', 'replace_text'] as const;
export type SectionEditOp = (typeof SECTION_EDIT_OPS)[number];
const INCREMENTAL: readonly SectionEditOp[] = ['add_to_set', 'remove_from_set', 'append_text', 'replace_text'];

/** One targeted edit, the same op and the same meaning as patch_section's. */
export interface SectionEdit {
	readonly op: SectionEditOp;
	readonly path?: string;
	readonly collection?: string;
	readonly id?: string;
	readonly match?: Readonly<Record<string, string | number | boolean | null>>;
	readonly insert?: boolean;
	readonly value?: unknown;
	readonly find?: string;
	readonly separator?: string;
}

export interface SectionDraft {
	/** `section:<something>`, kept until the change lands. */
	readonly id: string;
	/** The page of the spec it changes. */
	readonly page: SpecPage;
	/** What the change does to that page, in the person's words. */
	summary: string;
	edits: SectionEdit[];
	sourceIds: string[];
	/** Set by the landing. */
	materialisedAt: string | null;
}

/* ------------------------------------------------------------ edit shapes */

const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v: unknown) => ['string', 'number', 'boolean'].includes(typeof v);

/**
 * Whether every edit is well formed, before any of them touches anything: the
 * sentence naming the first one that is not, or null.
 */
export function sectionEditsIssue(edits: readonly unknown[]): string | null {
	if (edits.length === 0) return 'A section change needs at least one edit.';
	if (edits.length > 1000) return 'A section change holds at most 1000 edits.';
	for (const [index, raw] of edits.entries()) {
		const bad = (why: string) => `Edit ${index + 1}: ${why}`;
		if (!isRecord(raw) || !(SECTION_EDIT_OPS as readonly string[]).includes(String(raw.op)))
			return bad(`unknown operation; the operations are ${SECTION_EDIT_OPS.join(', ')}.`);
		const op = raw as unknown as SectionEdit;
		for (const path of [op.path, op.collection]) {
			if (path === undefined) continue;
			if (typeof path !== 'string' || path.split('.').some((k) => !k || UNSAFE.has(k))) return bad('a path segment is empty or unsafe.');
			if (path.split('.')[0] === 'projectId') return bad('projectId is not the change\'s to edit.');
		}
		const selector = op.id !== undefined || op.match !== undefined;
		const selectorIssue = (): string | null => {
			if ((op.id === undefined) === (op.match === undefined)) return bad('a row is chosen by exactly one of id or match.');
			if (op.id !== undefined && (typeof op.id !== 'string' || !op.id)) return bad('id must be a nonempty string.');
			if (op.match !== undefined && (!isRecord(op.match) || Object.keys(op.match).length === 0 || Object.entries(op.match).some(([k, v]) => UNSAFE.has(k) || (v !== null && !isScalar(v)))))
				return bad('match must be a nonempty object of scalar fields.');
			return null;
		};
		if (INCREMENTAL.includes(op.op)) {
			if (!op.path || !Object.hasOwn(op, 'value')) return bad(`${op.op} takes a path and a value.`);
			if (op.collection !== undefined) {
				const issue = selectorIssue();
				if (issue) return issue;
			} else if (selector) return bad('id and match choose a row of a collection: name the collection too.');
			if (op.op === 'add_to_set' || op.op === 'remove_from_set') {
				if (!isScalar(op.value)) return bad(`${op.op} takes a scalar value.`);
			} else if (typeof op.value !== 'string') return bad(`${op.op} takes a text value.`);
			if (op.op === 'append_text' && !op.value) return bad('append_text needs a nonempty value.');
			if (op.op === 'replace_text' && (typeof op.find !== 'string' || !op.find)) return bad('replace_text needs the text to find.');
		} else if (op.op === 'append') {
			if (!op.collection || op.path !== undefined || op.match !== undefined || op.insert !== undefined)
				return bad('append takes a collection and a value, nothing to choose a row with.');
			if (op.id !== undefined && (typeof op.id !== 'string' || !op.id)) return bad('id must be a nonempty string.');
			if (!isRecord(op.value) || Object.keys(op.value).some((k) => UNSAFE.has(k))) return bad('append takes an object value.');
		} else if (op.op === 'set') {
			if (!op.path || op.collection !== undefined || selector || !Object.hasOwn(op, 'value')) return bad('set takes a path and a value, no collection.');
		} else if (op.op === 'merge' || op.collection !== undefined) {
			if (!op.collection || op.path !== undefined) return bad('a collection edit takes a collection and exactly one of id or match.');
			const issue = selectorIssue();
			if (issue) return issue;
			if (op.op === 'merge' && (!isRecord(op.value) || Object.keys(op.value).some((k) => UNSAFE.has(k)))) return bad('merge takes an object value.');
		} else if (!op.path) return bad('remove takes a path, or a collection and a row.');
	}
	return null;
}

/* ------------------------------------------------------- what a page shows */

/** Where an edit writes inside its section: the collection, then the path inside the row; or the path. */
export function editAddress(edit: SectionEdit): string {
	return edit.collection !== undefined ? (edit.path ? `${edit.collection}.${edit.path}` : edit.collection) : (edit.path ?? '');
}

/** The place of the page an edit writes at or under; null when the page shows nothing there. */
export function placeOfEdit(page: SpecPage, edit: SectionEdit): SpecPagePlace | null {
	const address = editAddress(edit);
	return SPEC_PAGES[page].places.find((p) => address === p.path || address.startsWith(`${p.path}.`)) ?? null;
}

/**
 * The first edit that writes what its page does not show, said so a person can
 * fix it; null when every edit lands on something the page shows.
 */
export function pageEditsRefusal(page: SpecPage, edits: readonly SectionEdit[]): string | null {
	const index = edits.findIndex((e) => placeOfEdit(page, e) === null);
	if (index < 0) return null;
	const { name, places } = SPEC_PAGES[page];
	const shown = [...new Set(places.map((p) => p.label))].join(', ');
	return `Edit ${index + 1} (${edits[index].op} on ${editAddress(edits[index]) || '?'}) writes what the ${name} page does not show: nobody could read or validate it on the spec. The ${name} page shows: ${shown}.`;
}

/** The edits of a change, by the section each one writes, in their order. */
export function editsBySection(page: SpecPage, edits: readonly SectionEdit[]): Map<DraftableSection, SectionEdit[]> {
	const by = new Map<DraftableSection, SectionEdit[]>();
	for (const edit of edits) {
		const place = placeOfEdit(page, edit);
		if (place) by.set(place.section, [...(by.get(place.section) ?? []), edit]);
	}
	return by;
}

/** "Requirements · Encryption": where a person reads the value an edit changes. */
export function editLabel(page: SpecPage, edit: SectionEdit): string {
	const place = placeOfEdit(page, edit);
	return `${SPEC_PAGES[page].name} · ${place?.label ?? editAddress(edit)}`;
}

/* ---------------------------------------------------------------- applying */

/** Read a dotted path (keys and array indices). */
function readPath(root: unknown, path: string): unknown {
	let node: unknown = root;
	for (const k of path.split('.')) {
		if (node == null || !k || UNSAFE.has(k)) return undefined;
		if (Array.isArray(node)) node = /^(0|[1-9]\d*)$/.test(k) ? node[Number(k)] : undefined;
		else if (typeof node === 'object') node = Object.hasOwn(node, k) ? (node as Record<string, unknown>)[k] : undefined;
		else return undefined;
	}
	return node;
}

function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
	const keys = path.split('.');
	let node = root;
	for (const k of keys.slice(0, -1)) {
		if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
		node = node[k] as Record<string, unknown>;
	}
	node[keys[keys.length - 1]] = value;
}

function deletePath(root: Record<string, unknown>, path: string): boolean {
	const keys = path.split('.');
	let node: unknown = root;
	for (const k of keys.slice(0, -1)) {
		const next = readPath(node, k);
		if (typeof next !== 'object' || next === null) return false;
		node = next;
	}
	const last = keys[keys.length - 1];
	if (Array.isArray(node)) {
		if (!/^(0|[1-9]\d*)$/.test(last) || Number(last) >= node.length) return false;
		node.splice(Number(last), 1);
		return true;
	}
	if (!Object.hasOwn(node as object, last)) return false;
	delete (node as Record<string, unknown>)[last];
	return true;
}

const collectionOf = (doc: Record<string, unknown>, collection: string): unknown => readPath(doc, collection);

function rowIndex(rows: unknown[], edit: SectionEdit): number {
	return rows.findIndex((row) => {
		if (!isRecord(row)) return false;
		if (edit.id !== undefined) return row.id === edit.id;
		return edit.match ? Object.entries(edit.match).every(([k, v]) => row[k] === v) : false;
	});
}

/** The container of the last segment, objects created on the way only when asked; never through a scalar. */
function parentOf(root: unknown, path: string, create: boolean): { node: Record<string, unknown>; key: string } | null {
	const keys = path.split('.');
	let node = root;
	for (const k of keys.slice(0, -1)) {
		const next = readPath(node, k);
		if (next === undefined && create && !Array.isArray(node) && isRecord(node)) {
			const made: Record<string, unknown> = {};
			node[k] = made;
			node = made;
		} else if (typeof next === 'object' && next !== null) node = next;
		else return null;
	}
	const key = keys[keys.length - 1];
	if (Array.isArray(node) && readPath(node, key) === undefined) return null;
	return { node: node as Record<string, unknown>, key };
}

function occurrences(text: string, needle: string): number[] {
	const at: number[] = [];
	for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) at.push(i);
	return at;
}

/** Whether the text around `find` at `at` already reads as `value` (a retry of an edit that landed). */
function readsAsValue(text: string, at: number, find: string, value: string): boolean {
	for (let k = value.indexOf(find); k !== -1; k = value.indexOf(find, k + 1)) if (at - k >= 0 && text.startsWith(value, at - k)) return true;
	return false;
}

type Outcome = 'changed' | 'unchanged' | { readonly notApplied: string };

function applyIncremental(doc: Record<string, unknown>, edit: SectionEdit): Outcome {
	let base: unknown = doc;
	if (edit.collection) {
		const rows = collectionOf(doc, edit.collection);
		const idx = Array.isArray(rows) ? rowIndex(rows, edit) : -1;
		if (idx < 0) return { notApplied: 'no row of the collection matches' };
		base = (rows as unknown[])[idx];
	}
	const path = edit.path as string;
	const creates = edit.op === 'add_to_set' || edit.op === 'append_text';
	const parent = parentOf(base, path, creates);
	if (!parent) return { notApplied: creates ? 'the path crosses a value that is not an object' : 'nothing at this path' };
	const { node, key } = parent;
	const current = readPath(node, key);
	const absent = current === undefined || current === null;
	if (edit.op === 'add_to_set' || edit.op === 'remove_from_set') {
		if (absent && edit.op === 'add_to_set') {
			node[key] = [edit.value];
			return 'changed';
		}
		if (!Array.isArray(current)) return { notApplied: absent ? 'no list at this path' : 'the value at this path is not a list' };
		if (edit.op === 'add_to_set') {
			if (current.includes(edit.value)) return 'unchanged';
			node[key] = [...current, edit.value];
			return 'changed';
		}
		if (!current.includes(edit.value)) return 'unchanged';
		node[key] = current.filter((item) => item !== edit.value);
		return 'changed';
	}
	const value = edit.value as string;
	if (edit.op === 'append_text') {
		if (!absent && typeof current !== 'string') return { notApplied: 'the value at this path is not a text' };
		const text = absent ? '' : (current as string);
		if (text.includes(value)) return 'unchanged';
		node[key] = text ? `${text}${edit.separator ?? '\n\n'}${value}` : value;
		return 'changed';
	}
	if (typeof current !== 'string') return { notApplied: absent ? 'no text at this path' : 'the value at this path is not a text' };
	const find = edit.find as string;
	const hits = occurrences(current, find);
	if (hits.length > 1) return { notApplied: `the text to replace occurs ${hits.length} times: lengthen it until it occurs once` };
	if (hits.length === 0) return { notApplied: 'the text to replace does not occur there' };
	if (find === value || readsAsValue(current, hits[0], find, value)) return 'unchanged';
	node[key] = current.slice(0, hits[0]) + value + current.slice(hits[0] + find.length);
	return 'changed';
}

function applyAppend(doc: Record<string, unknown>, edit: SectionEdit): Outcome {
	const collection = edit.collection as string;
	let rows = collectionOf(doc, collection);
	if (rows === undefined || rows === null) {
		const parent = parentOf(doc, collection, false);
		if (!parent) return { notApplied: 'no collection at this path, and its parent does not exist' };
		parent.node[parent.key] = [];
		rows = parent.node[parent.key];
	}
	if (!Array.isArray(rows)) return { notApplied: 'the value at this path is not a collection' };
	const row = edit.id !== undefined ? { id: edit.id, ...(edit.value as object) } : { ...(edit.value as object) };
	const already = edit.id !== undefined ? rows.some((x) => isRecord(x) && x.id === edit.id) : rows.some((x) => JSON.stringify(x) === JSON.stringify(row));
	if (already) return 'unchanged';
	rows.push(row);
	return 'changed';
}

function applyAssigning(doc: Record<string, unknown>, edit: SectionEdit): Outcome {
	if (edit.op === 'set' && edit.path) {
		setPath(doc, edit.path, edit.value);
		return 'changed';
	}
	if (edit.op === 'merge' && edit.collection) {
		const rows = collectionOf(doc, edit.collection);
		if (!Array.isArray(rows)) return { notApplied: 'no collection at this path' };
		const idx = rowIndex(rows, edit);
		if (idx >= 0) {
			rows[idx] = { ...(rows[idx] as object), ...(edit.value as object) };
			return 'changed';
		}
		if (!edit.insert) return { notApplied: `no row matches: merge edits a row that exists; to add one, append to "${edit.collection}"` };
		rows.push(edit.id !== undefined ? { id: edit.id, ...(edit.value as object) } : { ...(edit.value as object) });
		return 'changed';
	}
	if (edit.op === 'remove') {
		if (edit.collection) {
			const rows = collectionOf(doc, edit.collection);
			if (!Array.isArray(rows)) return { notApplied: 'no collection at this path' };
			const idx = rowIndex(rows, edit);
			if (idx < 0) return { notApplied: 'no row of the collection matches' };
			rows.splice(idx, 1);
			return 'changed';
		}
		return edit.path && deletePath(doc, edit.path) ? 'changed' : { notApplied: 'nothing at this path' };
	}
	return { notApplied: 'nothing to do' };
}

/** What an edit is aimed at, in the words a reader follows. */
export function editTarget(edit: SectionEdit): string {
	const row = edit.collection !== undefined ? `${edit.collection}[${edit.id ?? (edit.match ? JSON.stringify(edit.match) : '+')}]` : '';
	return row && edit.path ? `${row}.${edit.path}` : row || edit.path || '?';
}

export interface SectionEditReport {
	readonly changed: readonly string[];
	readonly unchanged: readonly string[];
	readonly notApplied: readonly { readonly index: number; readonly op: SectionEditOp; readonly target: string; readonly reason: string }[];
}

/**
 * The section as the edits would leave it, on a copy: the section given is
 * never touched. Each edit says what it did, in order.
 */
export function applySectionEdits(section: unknown, edits: readonly SectionEdit[]): { readonly section: Record<string, unknown>; readonly report: SectionEditReport } {
	const doc = structuredClone(isRecord(section) ? section : {}) as Record<string, unknown>;
	const changed: string[] = [];
	const unchanged: string[] = [];
	const notApplied: { index: number; op: SectionEditOp; target: string; reason: string }[] = [];
	for (const [index, edit] of edits.entries()) {
		const outcome = INCREMENTAL.includes(edit.op) ? applyIncremental(doc, edit) : edit.op === 'append' ? applyAppend(doc, edit) : applyAssigning(doc, edit);
		if (typeof outcome === 'object') notApplied.push({ index, op: edit.op, target: editTarget(edit), reason: outcome.notApplied });
		else (outcome === 'changed' ? changed : unchanged).push(editTarget(edit));
	}
	return { section: doc, report: { changed, unchanged, notApplied } };
}

/** The first edit that does not apply, said so a person can fix it; null when all apply. */
export function sectionEditsRefusal(report: SectionEditReport, pageName: string): string | null {
	const first = report.notApplied[0];
	return first ? `Edit ${first.index + 1} (${first.op} on ${first.target}) does not apply to ${pageName} as it stands: ${first.reason}.` : null;
}

/* ----------------------------------------------------------------- reading */

/** A value as a person reads it on a card: a text as it is, a list as its items, a row as its words (its id left out). */
export function showValue(value: unknown, max = 600): string {
	const words = (v: unknown): string => {
		if (v === undefined || v === null) return '';
		if (typeof v === 'string') return v;
		if (typeof v === 'number' || typeof v === 'boolean') return String(v);
		if (Array.isArray(v)) return v.map(words).filter(Boolean).join(', ');
		if (isRecord(v))
			return Object.entries(v)
				.filter(([k]) => k !== 'id')
				.map(([, x]) => words(x))
				.filter(Boolean)
				.join(' · ');
		return '';
	};
	const text = words(value);
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface SectionValueChange {
	/** Where a person reads it: the page, then the place on it ("Requirements · Encryption"). */
	readonly label: string;
	/** Where it sits inside the section, for whoever fixes an edit. */
	readonly target: string;
	readonly before: string;
	readonly after: string;
}

/** Where an edit reads and writes its value, inside the section. */
function locate(doc: unknown, edit: SectionEdit): unknown {
	if (edit.collection !== undefined) {
		const rows = readPath(doc, edit.collection);
		if (!Array.isArray(rows)) return undefined;
		if (edit.op === 'append') {
			const id = edit.id;
			return id !== undefined ? rows.find((r) => isRecord(r) && r.id === id) : undefined;
		}
		const idx = rowIndex(rows, edit);
		const row = idx >= 0 ? rows[idx] : undefined;
		if (edit.path) return readPath(row, edit.path);
		if (edit.op === 'merge' && isRecord(row) && isRecord(edit.value)) return Object.fromEntries(Object.keys(edit.value).map((k) => [k, row[k]]));
		return row;
	}
	return edit.path ? readPath(doc, edit.path) : undefined;
}

/**
 * Each value the change moves, as it is and as it would be, edit by edit, named
 * as its page names it (ac-evo-draft-section-read). An append shows the row it
 * adds; a merge only the fields it writes. `sections` holds the sections behind
 * the page as they stand.
 */
export function sectionDraftChanges(
	sections: Partial<Record<DraftableSection, unknown>>,
	page: SpecPage,
	edits: readonly SectionEdit[],
	valueLabel?: PageValueLabel
): SectionValueChange[] {
	const after = new Map<DraftableSection, Record<string, unknown>>();
	for (const [section, own] of editsBySection(page, edits)) after.set(section, applySectionEdits(sections[section], own).section);
	return edits.map((edit) => {
		const place = placeOfEdit(page, edit);
		const section = place?.section;
		const before = section ? sections[section] : undefined;
		const now = section ? after.get(section) : undefined;
		const freshAppend = edit.op === 'append' && edit.id === undefined;
		// A choice reads as its page shows it, never as the code stored behind it (ac-evo-draft-section-read).
		const words = (value: unknown) => showValue(place && valueLabel ? relabelled(value, (code) => valueLabel(place, code)) : value);
		return {
			label: editLabel(page, edit),
			target: editTarget(edit),
			before: words(freshAppend ? undefined : locate(before, edit)),
			after: words(freshAppend ? edit.value : edit.op === 'remove' && edit.collection !== undefined ? undefined : locate(now, edit))
		};
	});
}

/**
 * How a page names a value it shows: the label of a choice ("In transit" for
 * `in_transit`), the value itself when the place shows it as it is. Given by
 * the caller, which knows the option lists of each page; the evolution domain
 * owes nothing to theirs.
 */
export type PageValueLabel = (place: SpecPagePlace, value: string) => string;

/** A value with every choice it holds, alone or in a list, said by its label. */
function relabelled(value: unknown, label: (code: string) => string): unknown {
	if (typeof value === 'string') return label(value);
	if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? label(v) : v));
	return value;
}

/** Every text a change writes, read for the glossary (ac-evo-draft-section-read). */
export function sectionDraftTexts(edits: readonly SectionEdit[]): string[] {
	const texts: string[] = [];
	const walk = (v: unknown) => {
		if (typeof v === 'string') texts.push(v);
		else if (Array.isArray(v)) v.forEach(walk);
		else if (isRecord(v)) Object.values(v).forEach(walk);
	};
	for (const edit of edits) if (edit.op !== 'remove' && edit.op !== 'remove_from_set') walk(edit.value);
	return texts;
}

/** The section changes still to land. */
export const liveSectionDrafts = (drafts: readonly SectionDraft[] | undefined): SectionDraft[] => (drafts ?? []).filter((d) => d.materialisedAt === null);

/** The kind of element a row of a page is in the knowledge graph, by the collection that holds it. */
const ROW_KIND: Readonly<Record<string, string>> = {
	roles: 'role',
	journeys: 'journey',
	steps: 'step',
	screens: 'screen',
	components: 'component',
	techChoices: 'tech',
	constraints: 'constraint'
};

/**
 * Where the impact walk starts for the request's section changes
 * (ac-evo-draft-section-impact): each element of the product an edit touches
 * (a role, a journey, a step, a screen, a component, a stack choice, a
 * technical constraint), as a knowledge graph id. A value no element holds on
 * its own (a requirement, a text of At a glance) starts nothing.
 */
export function sectionDraftStartNodeIds(drafts: readonly SectionDraft[] | undefined): { readonly nodeId: string; readonly changeId: string }[] {
	const starts: { nodeId: string; changeId: string }[] = [];
	for (const draft of liveSectionDrafts(drafts)) {
		for (const edit of draft.edits) {
			const kind = edit.collection !== undefined ? ROW_KIND[edit.collection.split('.').at(-1) ?? ''] : undefined;
			const id = edit.id ?? (typeof edit.match?.id === 'string' ? edit.match.id : undefined);
			if (kind && id) starts.push({ nodeId: `${kind}:${id}`, changeId: draft.id });
		}
	}
	return starts;
}

/* --------------------------------------------------------------- coherence */

const SECTION_TITLES = {
	en: {
		bannedWord: (page: string, avoid: string, prefer: string) => `The change on ${page} writes "${avoid}", which the glossary asks to be called "${prefer}"`,
		noLongerApplies: (page: string, why: string) => `The change on ${page} no longer applies: ${why}`
	},
	fr: {
		bannedWord: (page: string, avoid: string, prefer: string) =>
			`Le changement de ${quoteName('fr', page)} écrit ${quoteName('fr', avoid)}, que le glossaire demande d'appeler ${quoteName('fr', prefer)}`,
		noLongerApplies: (page: string, why: string) => `Le changement de ${quoteName('fr', page)} ne s'applique plus : ${why}`
	}
} as const;

/** The graph id of a section change while it is only a change. */
export const sectionDraftNodeId = (draft: Pick<SectionDraft, 'id'>): string => `section:${draft.id}`;

/**
 * What a section change would contradict, read off the section as the change
 * leaves it (ac-evo-draft-section-read): a word the glossary bans in a value it
 * writes, and a change the section moved away from since it was drafted, which
 * would hold the landing (ac-evo-draft-section-landing).
 */
export function sectionDraftCoherence(input: {
	readonly request: Pick<EvolutionRequest, 'id' | 'sectionDrafts'>;
	readonly bannedWords?: readonly { readonly avoid: string; readonly prefer: string }[];
	/** Per change, the sentence saying why it no longer applies to the section as it stands, or null. */
	readonly noLongerApplies?: Readonly<Record<string, string | null>>;
	readonly lang?: SpecLanguage;
}): CoherenceFinding[] {
	const titles = SECTION_TITLES[input.lang ?? 'en'];
	const findings: CoherenceFinding[] = [];
	for (const draft of liveSectionDrafts(input.request.sectionDrafts)) {
		const page = SPEC_PAGES[draft.page].name;
		const why = input.noLongerApplies?.[draft.id];
		if (why)
			findings.push({
				id: stableId('coh-section-stale', input.request.id, draft.id),
				axis: 'structural',
				severity: 'blocking',
				title: titles.noLongerApplies(page, why),
				requestNodeId: sectionDraftNodeId(draft),
				existingNodeId: `page:${draft.page}`,
				fixNowTarget: `evolution.${input.request.id}.sectionDrafts.${draft.id}`,
				published: true
			});
		const written = withoutQuotations(sectionDraftTexts(draft.edits).join(' '));
		for (const banned of input.bannedWords ?? []) {
			const avoid = banned.avoid.trim();
			if (avoid.length < 2) continue;
			const pattern = new RegExp(`\\b${avoid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
			if (!pattern.test(written)) continue;
			findings.push({
				id: stableId('coh-section-word', input.request.id, draft.id, avoid),
				axis: 'semantic',
				severity: 'major',
				title: titles.bannedWord(page, avoid, banned.prefer),
				requestNodeId: sectionDraftNodeId(draft),
				existingNodeId: `term:${banned.prefer}`,
				fixNowTarget: 'glossary.terms',
				published: true
			});
			break;
		}
	}
	return findings;
}
