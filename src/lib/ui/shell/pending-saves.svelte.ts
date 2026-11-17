/**
 * The acts a page shows before the server confirmed them, counted for the
 * whole window (criterion 27bbfacd): while one is still on its way the app
 * reads Saving with how many wait, then Saved for a moment once the last one
 * is confirmed. A refused act says itself what was not saved (its toast).
 */
const SAVED_SHOWN_MS = 1500;

let waiting = $state(0);
let savedAt = $state(0);

export const pendingSaves = {
	/** How many acts are on their way to the server. */
	get waiting(): number {
		return waiting;
	},
	/** True for a moment after the last waiting act was confirmed. */
	get justSaved(): boolean {
		return waiting === 0 && savedAt > 0 && Date.now() - savedAt < SAVED_SHOWN_MS;
	}
};

/** Counts one act from the moment it is sent until its save settles; resolves to the save's own answer. */
export function trackSave<T>(save: Promise<T>, ok: (value: T) => boolean = (value) => value !== false): Promise<T> {
	waiting += 1;
	return save.then(
		(value) => {
			settle(ok(value));
			return value;
		},
		(error: unknown) => {
			settle(false);
			throw error;
		}
	);
}

function settle(saved: boolean): void {
	waiting = Math.max(0, waiting - 1);
	if (waiting === 0 && saved) {
		const at = Date.now();
		savedAt = at;
		// Read again once the moment is over, so the word leaves on its own.
		setTimeout(() => {
			if (savedAt === at) savedAt = 0;
		}, SAVED_SHOWN_MS);
	}
}
