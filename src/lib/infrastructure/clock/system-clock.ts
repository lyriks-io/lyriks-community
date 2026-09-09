import type { ClockPort } from '$application/ports';

/** Real wall-clock implementation of ClockPort. */
export class SystemClock implements ClockPort {
	nowIso(): string {
		return new Date().toISOString();
	}
}
