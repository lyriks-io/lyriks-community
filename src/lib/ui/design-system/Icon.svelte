<script lang="ts" module>
	// Stroke icon set (24×24, currentColor). Inner markup is static and trusted.
	export const ICONS = {
		sparkles:
			'<path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7z"/><path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
		target:
			'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/>',
		users:
			'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><path d="M16 5.2a3.2 3.2 0 010 6"/><path d="M16.5 13.5a5.5 5.5 0 014 5.5"/>',
		user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0114 0"/>',
		layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
		'external-link':
			'<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 13.5V18a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4.5"/>',
		link: '<path d="M10 13.5a4 4 0 006 .6l2.6-2.6a4 4 0 00-5.7-5.7L11.6 7.1"/><path d="M14 10.5a4 4 0 00-6-.6l-2.6 2.6a4 4 0 005.7 5.7l1.3-1.3"/>',
		monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/>',
		smartphone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11.5 17.5h1"/>',
		tablet: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M11.5 17.5h1"/>',
		tv: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 3l4 4 4-4"/>',
		play: '<path d="M7.5 5l11 7-11 7z"/>',
		sliders:
			'<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>',
		database:
			'<ellipse cx="12" cy="5.5" rx="7" ry="2.8"/><path d="M5 5.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/><path d="M5 11.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/>',
		server:
			'<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01"/><path d="M7 16.5h.01"/>',
		table:
			'<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 10h18"/><path d="M9.5 10v9.5"/>',
		gauge:
			'<path d="M3.5 18a9 9 0 1117 0"/><path d="M12 18l4-5"/><circle cx="12" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
		cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
		'file-check':
			'<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M9 14.5l2 2 4-4"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
		bell: '<path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 004 0"/>',
		grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
		flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 3 2 3H5"/>',
		'chevron-right': '<path d="M9 6l6 6-6 6"/>',
		'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
		'chevron-down': '<path d="M6 9l6 6 6-6"/>',
		'panel-left':
			'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M6.5 8h.01"/><path d="M6.5 12h.01"/>',
		'panel-left-open':
			'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M12 12h5"/><path d="M15 9l3 3-3 3"/>',
		'panel-left-close':
			'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M17 12h-5"/><path d="M14 9l-3 3 3 3"/>',
		pin: '<path d="M12 17v5"/><path d="M8 3h8l-1 7 3 3v2H6v-2l3-3z"/>',
		'arrow-right': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
		'arrow-left': '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
		'arrow-up-right': '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
		filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
		check: '<path d="M5 12.5l4 4 10-10"/>',
		copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
		list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
		pencil:
			'<path d="M4 20h4L18.5 9.5a2 2 0 000-2.8l-1.2-1.2a2 2 0 00-2.8 0L4 16z"/><path d="M13.5 6.5l4 4"/>',
		x: '<path d="M6 6l12 12M18 6L6 18"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		minus: '<path d="M5 12h14"/>',
		maximize:
			'<path d="M4 9V5a1 1 0 011-1h4"/><path d="M15 4h4a1 1 0 011 1v4"/><path d="M20 15v4a1 1 0 01-1 1h-4"/><path d="M9 20H5a1 1 0 01-1-1v-4"/>',
		rotate: '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.3 2.6L3 8"/><path d="M3 4v4h4"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
		lightbulb:
			'<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 00-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0012 3z"/>',
		trophy:
			'<path d="M8 4h8v4a4 4 0 01-8 0z"/><path d="M8 5H5v2a3 3 0 003 3M16 5h3v2a3 3 0 01-3 3"/><path d="M10 13.5h4M9 20h6M12 13.5V20"/>',
		tag: '<path d="M3 11l8-8 9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/>',
		eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
		'eye-off':
			'<path d="M2 12s3.5-7 10-7c1.5 0 2.8.4 4 .9"/><path d="M19.2 8.3A16 16 0 0122 12s-3.5 7-10 7c-1.5 0-2.8-.4-4-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/><path d="M3.5 3.5l17 17"/>',
		book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
		globe:
			'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/>',
		shield: '<path d="M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6z"/>',
		settings:
			'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
		'circle-alert': '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
		'alert-triangle':
			'<path d="M12 4L3 19.2A1.4 1.4 0 004.2 21.3h15.6A1.4 1.4 0 0021 19.2z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>',
		circle: '<circle cx="12" cy="12" r="8.5"/>',
		lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
		key: '<circle cx="8" cy="15" r="3.8"/><path d="M10.8 12.2L20 3"/><path d="M16.5 6.5l2.5 2.5"/><path d="M14.3 8.7l2.2 2.2"/>',
		bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
		ellipsis:
			'<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
		grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
		image:
			'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/>',
		download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>',
		upload: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/>',
		file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>',
		calendar:
			'<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v3.5"/><path d="M16 3v3.5"/>',
		clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
		'arrow-up': '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
		'arrow-down': '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
		mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7.5l8.5 6 8.5-6"/>',
		smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 007 0"/><path d="M9 9.5h.01"/><path d="M15 9.5h.01"/>',
		meh: '<circle cx="12" cy="12" r="9"/><path d="M8.5 15h7"/><path d="M9 9.5h.01"/><path d="M15 9.5h.01"/>',
		frown: '<circle cx="12" cy="12" r="9"/><path d="M15.5 15.5a4.5 4.5 0 00-7 0"/><path d="M9 9.5h.01"/><path d="M15 9.5h.01"/>',
		send: '<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8z"/>',
		megaphone: '<path d="M3 11l18-6v13L3 13z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/>',
		'log-out': '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'
	} as const;

	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		size?: number;
		class?: string;
	}
	let { name, size = 20, class: klass = '' }: Props = $props();
</script>

<svg
	class={klass}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html ICONS[name]}
</svg>
