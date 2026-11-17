import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEXT_HINT, STEP_FOOT_ID, bringNextToValidate, markNext, markPlace, nextActionIn, nextToValidate, placeOnPage, unmarkNext } from './evo-scroll';

/** Just enough of an element for the page's scroll and mark: an id, its classes, a box. */
function element(id: string) {
	const classes = new Set<string>();
	return {
		id,
		offsetWidth: 0,
		parentElement: null,
		classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
		has: (c: string) => classes.has(c),
		getBoundingClientRect: () => ({ top: 400, bottom: 440 })
	};
}

describe('a link opens the exact place and marks it [criterion:ac-leaf-ac-evo-live-guide]', () => {
	let drawn: Record<string, ReturnType<typeof element>>;
	beforeEach(() => {
		drawn = {};
		vi.stubGlobal('window', { scrollY: 0, innerHeight: 900, scrollTo: vi.fn(), setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) });
		vi.stubGlobal('document', { getElementById: (id: string) => drawn[id] ?? null, querySelector: () => null });
		vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0));
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('finds the place itself before the section around it, waiting for a step still rendering', async () => {
		drawn['need-current'] = element('need-current');
		setTimeout(() => (drawn['place-proposal__p1'] = element('place-proposal__p1')), 0);
		expect((await placeOnPage(['place-proposal__p1', 'need-current']))?.id).toBe('place-proposal__p1');
		expect((await placeOnPage(['place-field__request__00-need.cost', 'need-current']))?.id).toBe('need-current');
		expect(await placeOnPage(['nowhere'], 2)).toBeNull();
	});

	it('marks the place for a moment, and again at every click on the same place', () => {
		vi.useFakeTimers();
		const place = element('place-proposal__p1');
		drawn[place.id] = place;
		markPlace(place as unknown as HTMLElement);
		expect(place.has('evo-place-mark')).toBe(true);
		vi.advanceTimersByTime(2400);
		expect(place.has('evo-place-mark')).toBe(false);
		markPlace(place as unknown as HTMLElement);
		expect(place.has('evo-place-mark')).toBe(true);
	});
});

describe('validating a block brings the next one to validate into view [criterion:ac-leaf-ac-evo-form-validate-next]', () => {
	/** The step as the page draws it, top to bottom; `waits` marks a block whose Validate still waits on the reader. */
	function page(blocks: { id: string; waits: boolean }[]) {
		const at = (id: string) => blocks.findIndex((b) => b.id === id);
		const el = (id: string) => ({
			...element(id),
			// Node.DOCUMENT_POSITION_FOLLOWING for a block drawn after this one, PRECEDING (2) otherwise.
			compareDocumentPosition: (other: { id: string }) => (at(other.id) > at(id) ? 4 : 2)
		});
		const drawn = Object.fromEntries(blocks.map((b) => [b.id, el(b.id)]));
		vi.stubGlobal('document', {
			getElementById: (id: string) => drawn[id] ?? null,
			querySelector: () => null,
			querySelectorAll: () => blocks.filter((b) => b.waits).map((b) => drawn[b.id])
		});
		return drawn;
	}
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('goes to the next block still waiting down the page, past the ones already validated', () => {
		page([
			{ id: 'need-origin', waits: true },
			{ id: 'need-current', waits: false },
			{ id: 'need-target', waits: true }
		]);
		expect(nextToValidate('need-origin')?.id).toBe('need-target');
	});

	it('with none left below, goes back to the first one still waiting above', () => {
		page([
			{ id: 'need-origin', waits: true },
			{ id: 'need-current', waits: true },
			{ id: 'need-target', waits: true }
		]);
		expect(nextToValidate('need-target')?.id).toBe('need-origin');
	});

	it('keeps moving down past a block left waiting above, whatever the order of the validations [criterion:27caa553]', () => {
		page([
			{ id: 'need-origin', waits: true },
			{ id: 'need-current', waits: true },
			{ id: 'need-target', waits: true }
		]);
		expect(nextToValidate('need-current')?.id).toBe('need-target');
	});

	it('never brings back the block just validated, even before it reads validated', () => {
		page([{ id: 'need-origin', waits: true }]);
		expect(nextToValidate('need-origin')).toBeNull();
	});

	/** A button inside a block, with the classes a nudge lays on it. */
	const button = () => element('');

	function scrollingWindow() {
		const scrollTo = vi.fn();
		vi.stubGlobal('window', { scrollY: 0, innerHeight: 900, scrollTo, setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) });
		vi.stubGlobal('getComputedStyle', () => ({ overflowY: 'visible' }));
		vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0));
		return scrollTo;
	}

	it('with nothing left waiting on the reader, goes to the step\'s call to action and pulses it', async () => {
		vi.useFakeTimers();
		const drawn = page([
			{ id: 'need-origin', waits: false },
			{ id: STEP_FOOT_ID, waits: false }
		]);
		const scrollTo = scrollingWindow();
		const goOn = button();
		Object.assign(drawn[STEP_FOOT_ID], { querySelector: () => null, querySelectorAll: () => [goOn] });
		drawn[STEP_FOOT_ID].getBoundingClientRect = () => ({ top: 2400, bottom: 2460 });
		bringNextToValidate('need-origin');
		await vi.advanceTimersByTimeAsync(800);
		expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 2400 - 140 - 16 }));
		expect(goOn.has('animate-lk-nudge')).toBe(true);
		await vi.advanceTimersByTimeAsync(2000);
		expect(goOn.has('animate-lk-nudge')).toBe(false);
	});

	it('brings the next block just under the header, even close below the one validated, and pulses its Validate', async () => {
		vi.useFakeTimers();
		const drawn = page([
			{ id: 'need-origin', waits: true },
			{ id: 'need-current', waits: true }
		]);
		const scrollTo = scrollingWindow();
		drawn['need-origin'].getBoundingClientRect = () => ({ top: 300, bottom: 360 });
		drawn['need-current'].getBoundingClientRect = () => ({ top: 420, bottom: 600 });
		const validate = button();
		Object.assign(drawn['need-current'], { querySelector: () => validate });
		bringNextToValidate('need-origin');
		await vi.advanceTimersByTimeAsync(800);
		expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 420 - 140 - 16 }));
		expect(validate.has('animate-lk-nudge')).toBe(true);
	});
});

describe('the page\'s next action reads violet', () => {
	/** A block waiting on the reader, holding its Validate (enabled or not), or none when it is folded. */
	const block = (validate: { id: string } | null) => ({ querySelector: () => validate });
	const root = (blocks: ReturnType<typeof block>[]) => ({ querySelectorAll: () => blocks }) as unknown as ParentNode;

	it('is the Validate of the first block still waiting on the reader, in page order', () => {
		const first = { id: 'v1' };
		expect(nextActionIn(root([block(first), block({ id: 'v2' })]))).toBe(first);
	});

	it('passes over a waiting block with no Validate to press (a folded group)', () => {
		const second = { id: 'v2' };
		expect(nextActionIn(root([block(null), block(second)]))).toBe(second);
	});

	it('names none once nothing waits on the reader', () => {
		expect(nextActionIn(root([]))).toBeNull();
	});
});

describe("the page's next Validate says why it is marked [criterion:987dac2d]", () => {
	/** Just enough of a button for its attributes. */
	function button(title: string | null) {
		const attrs = new Map<string, string>(title === null ? [] : [['title', title]]);
		return {
			getAttribute: (k: string) => attrs.get(k) ?? null,
			setAttribute: (k: string, v: string) => void attrs.set(k, v),
			removeAttribute: (k: string) => void attrs.delete(k),
			attrs
		};
	}

	it('says it is the next one after what it validates, once, and gives its own tooltip back', () => {
		const b = button('Validate the journey');
		markNext(b as unknown as HTMLElement);
		markNext(b as unknown as HTMLElement);
		expect(b.attrs.get('title')).toBe(`Validate the journey · ${NEXT_HINT}`);
		expect(b.attrs.has('data-evo-next')).toBe(true);
		unmarkNext(b as unknown as HTMLElement);
		expect(b.attrs.get('title')).toBe('Validate the journey');
		expect(b.attrs.has('data-evo-next')).toBe(false);
	});

	it('reads the hint alone on a Validate with no tooltip of its own', () => {
		const b = button(null);
		markNext(b as unknown as HTMLElement);
		expect(b.attrs.get('title')).toBe(NEXT_HINT);
		unmarkNext(b as unknown as HTMLElement);
		expect(b.attrs.has('title')).toBe(false);
	});
});
