/**
 * Per-screen device layout — what physical surface a screen is viewed on. Drives
 * the simulator's fake-window size + aspect ratio (and the macOS environment in
 * fullscreen). `auto` follows the project-level viewport/form-factor.
 */
import type { Option } from '$domain/shared';
import { resolveViewport, type SimTheme } from './theme';

export type DeviceKind = 'auto' | 'mobile' | 'tablet' | 'desktop' | 'tv' | 'custom';

export const DEVICES = [
	{ code: 'auto', label: 'Auto (project)' },
	{ code: 'mobile', label: 'Mobile' },
	{ code: 'tablet', label: 'Tablet' },
	{ code: 'desktop', label: 'Desktop' },
	{ code: 'tv', label: 'TV' },
	{ code: 'custom', label: 'Custom' }
] as const satisfies readonly Option[];

export interface DeviceSize {
	/** Concrete device the size came from (never 'auto'). */
	kind: Exclude<DeviceKind, 'auto'> | 'cli';
	w: number;
	h: number;
}

const PRESETS: Record<'mobile' | 'tablet' | 'desktop' | 'tv', { w: number; h: number }> = {
	mobile: { w: 390, h: 844 },
	tablet: { w: 834, h: 1112 },
	desktop: { w: 1440, h: 900 },
	tv: { w: 1920, h: 1080 }
};

const clampDim = (n: number) => Math.max(240, Math.min(4096, Math.round(n || 0)));

/** Native dimensions for a concrete device preset (used by the ratio selector). */
export function presetSize(kind: 'mobile' | 'tablet' | 'desktop' | 'tv'): { w: number; h: number } {
	return PRESETS[kind];
}

/** Fit a w×h into available space, preserving aspect ratio (never upscales past 1×). */
export function fitWithin(w: number, h: number, availW: number, availH: number): { w: number; h: number } {
	const scale = Math.min(1, availW / w, availH / h);
	return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/**
 * Window chrome a device renders with. Every device is a browser window sized to
 * its ratio (mobile = a narrow browser window, not a phone bezel) — only a CLI
 * surface gets terminal chrome.
 */
export function deviceChrome(kind: DeviceSize['kind']): 'browser' | 'device' | 'terminal' {
	if (kind === 'cli') return 'terminal';
	return 'browser';
}

/** Dimensions implied by the project viewport (for `auto` screens). */
function viewportDeviceSize(vp: ReturnType<typeof resolveViewport>): DeviceSize {
	switch (vp) {
		case 'mobile':
			return { kind: 'mobile', ...PRESETS.mobile };
		case 'tablet':
			return { kind: 'tablet', ...PRESETS.tablet };
		case 'small':
			return { kind: 'desktop', w: 640, h: 880 };
		case 'medium':
			return { kind: 'desktop', w: 880, h: 900 };
		case 'large':
			return { kind: 'desktop', w: 1280, h: 880 };
		case 'full':
			return { kind: 'desktop', w: 1680, h: 1000 };
		case 'cli':
			return { kind: 'cli', w: 900, h: 600 };
		default:
			return { kind: 'desktop', ...PRESETS.desktop };
	}
}

/** Resolve a screen's device fields to a concrete {kind, w, h}. */
export function resolveDeviceSize(
	device: DeviceKind,
	customW: number,
	customH: number,
	theme: SimTheme,
	formFactors: readonly string[]
): DeviceSize {
	if (device === 'custom') return { kind: 'custom', w: clampDim(customW || 1024), h: clampDim(customH || 768) };
	if (device !== 'auto') return { kind: device, ...PRESETS[device] };
	return viewportDeviceSize(resolveViewport(theme.viewport, formFactors));
}
