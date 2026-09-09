import { matchesQuery } from './search';

/**
 * The shared list-filtering module.
 *
 * `SearchInput` + `matchesQuery` give every page the same free-text box. This
 * adds the second half: the FACETS a page needs on top of the text, declared
 * from the page's own content rather than hand-rolled per screen. A page says
 * what its rows read as and which of their attributes are worth narrowing by;
 * the state, the AND/OR semantics, the "n of m" readout and the reset all live
 * here, and `FilterBar` renders them.
 *
 *     const filter = createFilter<Rule>({
 *       noun: 'rules',
 *       placeholder: 'Search a rule…',
 *       fields: (r) => [r.label, r.statement],
 *       facets: [
 *         { key: 'category', label: 'Category', value: (r) => r.category, options: CATEGORIES },
 *         { key: 'mandatory', label: 'Mandatory only', kind: 'toggle', value: (r) => r.mandatory }
 *       ]
 *     });
 *     const visible = $derived(filter.apply(allRules));
 *
 * Semantics, fixed once so no two pages disagree: text AND facets; WITHIN one
 * facet the selected values are OR-ed (three statuses ticked = rows in any of
 * them); ACROSS facets they are AND-ed (a status AND an owner). A facet with
 * nothing selected constrains nothing.
 */

export type FacetKind = 'pills' | 'select' | 'toggle';

export interface FacetOption {
	value: string;
	label: string;
}

export interface FacetDef<T> {
	/** Stable key; also the state key. */
	key: string;
	label: string;
	/** `pills` (default) for a handful of values, `select` for many, `toggle` for a flag. */
	kind?: FacetKind;
	/**
	 * The item's value(s) for this facet. Return an array for multi-valued
	 * attributes (tags, actors); a boolean for a `toggle`; null/'' for "not set",
	 * which only the explicit `__none__` option matches.
	 */
	value: (item: T) => string | readonly string[] | boolean | null | undefined;
	/** Fixed options. Omitted: derived from the data, in first-seen order. */
	options?: readonly FacetOption[];
	/** Label for rows whose value is empty. Omitted: those rows get no option. */
	noneLabel?: string;
	hint?: string;
}

export interface FilterSpec<T> {
	/** What the free-text box searches, per item. */
	fields: (item: T) => (string | null | undefined)[];
	facets?: readonly FacetDef<T>[];
	placeholder?: string;
	/** Plural noun for the readout, e.g. "rules" in "12 of 40 rules". */
	noun?: string;
}

/** The sentinel option value standing for "this attribute is not set". */
export const NONE_VALUE = '__none__';

/** Normalizes a facet reader's return into the list of values to match against. */
function valuesOf<T>(facet: FacetDef<T>, item: T): string[] {
	const raw = facet.value(item);
	if (raw === true) return ['on'];
	if (raw === false || raw == null || raw === '') return [NONE_VALUE];
	if (Array.isArray(raw)) {
		const list = raw.filter((v) => v !== '');
		return list.length > 0 ? [...list] : [NONE_VALUE];
	}
	return [raw as string];
}

export class Filter<T> {
	/** The free-text query. Bind it to a `SearchInput`. */
	query = $state('');
	/** Selected values per facet key; an absent or empty entry constrains nothing. */
	selected = $state<Record<string, string[]>>({});

	readonly spec: FilterSpec<T>;

	constructor(spec: FilterSpec<T>) {
		this.spec = spec;
	}

	get facets(): readonly FacetDef<T>[] {
		return this.spec.facets ?? [];
	}
	get placeholder(): string {
		return this.spec.placeholder ?? 'Search…';
	}
	get noun(): string {
		return this.spec.noun ?? 'items';
	}

	/** True once anything is narrowing the list (text or facets). */
	get active(): boolean {
		return this.query.trim().length > 0 || this.activeFacetCount > 0;
	}
	get activeFacetCount(): number {
		return Object.values(this.selected).filter((v) => v.length > 0).length;
	}

	isSelected = (key: string, value: string): boolean =>
		(this.selected[key] ?? []).includes(value);

	/** Adds or removes one value of a facet (facets are multi-select). */
	toggle = (key: string, value: string): void => {
		const current = this.selected[key] ?? [];
		const next = current.includes(value)
			? current.filter((v) => v !== value)
			: [...current, value];
		this.selected = { ...this.selected, [key]: next };
	};

	/** Replaces a facet's whole selection (what a `select` control does). */
	set = (key: string, values: string[]): void => {
		this.selected = { ...this.selected, [key]: values };
	};

	clearFacet = (key: string): void => {
		this.selected = { ...this.selected, [key]: [] };
	};

	/** Back to "no filter at all", text included. */
	clear = (): void => {
		this.query = '';
		this.selected = {};
	};

	/** Does one item survive the text box and every facet? */
	matches = (item: T): boolean => {
		if (!matchesQuery(this.query, ...this.spec.fields(item))) return false;
		for (const facet of this.facets) {
			const picked = this.selected[facet.key] ?? [];
			if (picked.length === 0) continue;
			const values = valuesOf(facet, item);
			if (!values.some((v) => picked.includes(v))) return false;
		}
		return true;
	};

	apply = (items: readonly T[]): T[] => items.filter(this.matches);

	/**
	 * A facet's options: the declared list, else every value present in `items`
	 * in first-seen order. `noneLabel` adds the explicit "not set" option when
	 * some row actually lacks a value, so the option never sits there empty.
	 */
	optionsFor = (facet: FacetDef<T>, items: readonly T[]): FacetOption[] => {
		if (facet.kind === 'toggle') return [{ value: 'on', label: facet.label }];
		const seen = new Map<string, FacetOption>();
		let sawNone = false;
		for (const item of items) {
			for (const v of valuesOf(facet, item)) {
				if (v === NONE_VALUE) {
					sawNone = true;
					continue;
				}
				if (!seen.has(v)) seen.set(v, { value: v, label: v });
			}
		}
		const declared = facet.options
			? facet.options.filter((o) => seen.has(o.value) || o.value === NONE_VALUE)
			: [...seen.values()];
		if (facet.noneLabel && sawNone) {
			return [...declared, { value: NONE_VALUE, label: facet.noneLabel }];
		}
		return [...declared];
	};

	/** How many of `items` one more option would keep, for the option's badge. */
	countFor = (facet: FacetDef<T>, option: FacetOption, items: readonly T[]): number => {
		let n = 0;
		for (const item of items) {
			if (!matchesQuery(this.query, ...this.spec.fields(item))) continue;
			let ok = true;
			for (const other of this.facets) {
				if (other.key === facet.key) continue;
				const picked = this.selected[other.key] ?? [];
				if (picked.length === 0) continue;
				if (!valuesOf(other, item).some((v) => picked.includes(v))) {
					ok = false;
					break;
				}
			}
			if (ok && valuesOf(facet, item).includes(option.value)) n++;
		}
		return n;
	};
}

/** Sugar so a page reads `const filter = createFilter<Row>({ … })`. */
export const createFilter = <T>(spec: FilterSpec<T>): Filter<T> => new Filter(spec);
