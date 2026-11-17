/**
 * The square-capped pictograms of the app's navigation and its panels, drawn
 * as the design draws them (1.75 strokes on a 24 grid): plain shapes bundled
 * with the app, nothing fetched.
 */
export type IconShape =
	| { readonly d: string }
	| { readonly circle: readonly [number, number, number] }
	| { readonly ellipse: readonly [number, number, number, number] }
	| { readonly rect: readonly [number, number, number, number] };

const CUBE = 'M12 3l8 4.5v9L12 21l-8-4.5v-9z';
const FOLDER = 'M3 6h7l2 2h9v11H3z';

export const SIDE_ICONS = {
	home: [{ d: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z' }],
	search: [{ circle: [10.5, 10.5, 6.5] }, { d: 'M15.5 15.5L20 20' }],
	bell: [{ d: 'M6 16V10a6 6 0 0 1 12 0v6l1.5 2h-15z' }, { d: 'M10 20.5h4' }],
	project: [{ d: CUBE }, { d: 'M4 7.5l8 4.5 8-4.5M12 12v9' }],
	right: [{ d: 'M9 6l6 6-6 6' }],
	up: [{ d: 'M7 14.5l5-5 5 5' }],
	overview: [{ d: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z' }],
	users: [{ circle: [9, 8.5, 3] }, { d: 'M3.5 19v-1a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v1' }, { circle: [16.5, 9.5, 2.5] }, { d: 'M16.5 14h.5a3.5 3.5 0 0 1 3.5 3.5V19' }],
	// A project's entries, drawn as the v3 design draws them (criterion b2f17eef).
	reverse: [{ d: 'M3 12a9 9 0 1 0 3-6.7L3 8' }, { d: 'M3 3v5h5' }],
	knowledge: [{ d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z' }, { d: 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5' }],
	changes: [{ circle: [6, 5, 2] }, { circle: [6, 19, 2] }, { circle: [18, 7, 2] }, { d: 'M6 7v10' }, { d: 'M18 9a7 7 0 0 1-7 7H8' }],
	mismatch: [{ d: 'M5 9h14M5 15h14' }, { d: 'M15 4L9 20' }],
	notices: [{ d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }, { circle: [12, 12, 3] }],
	help: [{ circle: [12, 12, 8.5] }, { d: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 16.5v.5' }],
	flag: [{ d: 'M5 20V4h10l-1.5 4L15 12H5' }],
	docs: [{ d: 'M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z' }],
	chat: [{ d: 'M5 6h14v10H10l-4 3v-3H5z' }],
	feedback: [{ d: 'M4 4h16v12H9l-5 4z' }, { d: 'M8 9h8M8 12h5' }],
	calendar: [{ d: 'M4 6h16v14H4zM4 10h16M8 4v4M16 4v4' }],
	external: [{ d: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6' }],
	settings: [{ circle: [12, 12, 3] }, { d: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1' }],
	plan: [{ d: 'M4 7h16v11H4z' }, { d: 'M4 11h16' }],
	signout: [{ d: 'M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10' }],
	close: [{ d: 'M6 6l12 12M18 6L6 18' }],
	menu: [{ d: 'M4 7h16M4 12h16M4 17h16' }],
	folder: [{ d: FOLDER }],
	// A row's menu: three square dots, as the strokes of the set draw them.
	copy: [{ rect: [9, 9, 11, 11] }, { d: 'M15 9V4H4v11h5' }],
	download: [{ d: 'M12 4v11M7 10.5l5 5 5-5M5 20h14' }],
	more: [{ d: 'M5 12h.01M12 12h.01M19 12h.01' }],
	move: [{ d: FOLDER }, { d: 'M10 13.5h6M13.5 11l2.5 2.5-2.5 2.5' }],
	trash: [{ d: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13' }],
	pencil: [{ d: 'M4 20h4L19 9l-4-4L4 16z' }],
	check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
	plus: [{ d: 'M12 5v14M5 12h14' }]
} as const satisfies Record<string, readonly IconShape[]>;

export type SideIconName = keyof typeof SIDE_ICONS;
