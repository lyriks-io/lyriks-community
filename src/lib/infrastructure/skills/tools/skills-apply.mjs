// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). How one
// sync_skills answer lands in the repository, for sync-skills.mjs: each file
// written exactly as published and only when it changed, each block merged
// between its markers and nothing else of the file, each hook wired into the
// project settings once, and a settings file that does not parse left alone.
// No dependencies, no network, Node 18+.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

/**
 * A path the server names, resolved under the repository, or a refusal. The
 * server only ever names repository-relative files; anything absolute or
 * climbing out of the repository is refused rather than written.
 */
export function safePath(root, path) {
	if (typeof path !== 'string' || !path.trim() || isAbsolute(path) || /^[A-Za-z]:/.test(path)) {
		throw new Error(`Refusing to write "${path}": not a path inside the repository.`);
	}
	const clean = normalize(path.replace(/\\/g, '/'));
	if (clean === '..' || clean.startsWith(`..${sep}`) || clean.split(/[\\/]/).includes('..')) {
		throw new Error(`Refusing to write "${path}": it climbs out of the repository.`);
	}
	return join(root, clean);
}

export const readText = (path) => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return null;
	}
};

/**
 * The file with `block` between `open` and `close`: the region replaced when
 * both markers are there, the block appended otherwise. Nothing else of the
 * file changes: it belongs to the person.
 */
export function mergeBlock(existing, block, open, close) {
	const text = existing ?? '';
	const start = text.indexOf(open);
	const end = start < 0 ? -1 : text.indexOf(close, start);
	if (start >= 0 && end >= 0) return text.slice(0, start) + block + text.slice(end + close.length);
	if (!text) return `${block}\n`;
	return `${text}${text.endsWith('\n') ? '\n' : '\n\n'}${block}\n`;
}

/**
 * Settings with the hook entry wired, or null when it already is. A
 * UserPromptSubmit entry goes under the first item; a PreToolUse entry under
 * the item whose matcher is the hook's (added when there is none). A command
 * that already names the hook's file counts as wired, whatever its options.
 */
export function wireHook(settings, hook) {
	const event = hook.settingsEvent;
	const next = structuredClone(settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {});
	next.hooks = next.hooks && typeof next.hooks === 'object' && !Array.isArray(next.hooks) ? next.hooks : {};
	const items = Array.isArray(next.hooks[event]) ? next.hooks[event] : [];
	next.hooks[event] = items;
	const names = (item) =>
		Array.isArray(item?.hooks) && item.hooks.some((entry) => typeof entry?.command === 'string' && entry.command.includes(hook.path));
	if (event === 'PreToolUse') {
		let item = items.find((candidate) => candidate && candidate.matcher === hook.settingsMatcher);
		if (item && names(item)) return null;
		if (!item) {
			item = { matcher: hook.settingsMatcher, hooks: [] };
			items.push(item);
		}
		item.hooks = Array.isArray(item.hooks) ? item.hooks : [];
		item.hooks.push(hook.settingsEntry);
		return next;
	}
	if (items.some(names)) return null;
	if (items.length === 0) items.push({ hooks: [] });
	items[0].hooks = Array.isArray(items[0].hooks) ? items[0].hooks : [];
	items[0].hooks.push(hook.settingsEntry);
	return next;
}

/** Everything one run did, in the order it did it. */
export function newReport() {
	return { written: [], merged: [], wired: [], current: 0, warnings: [], calls: 0 };
}

/** Write a file only when its text changes; say whether it did. */
function writeIfChanged(root, path, text) {
	const target = safePath(root, path);
	if (readText(target) === text) return false;
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, text);
	return true;
}

function applyMerge(root, report, path, block, open, close) {
	const target = safePath(root, path);
	const before = readText(target);
	const after = mergeBlock(before, block, open, close);
	if (after === before) return;
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, after);
	report.merged.push(path);
}

/** Wire one hook into its settings file, never touching a file that does not parse. */
function applyWiring(root, report, hook) {
	const target = safePath(root, hook.settingsPath);
	const before = readText(target);
	if (before === null) {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, hook.settingsContent);
		report.wired.push(`${hook.settingsPath}: ${hook.settingsEvent} -> ${hook.path}`);
		return;
	}
	let settings;
	try {
		settings = JSON.parse(before);
	} catch (error) {
		// One trailing comma once switched every hook of a project off in silence:
		// the file is the person's, so it is reported, never rewritten.
		report.warnings.push(
			`${hook.settingsPath} is not valid JSON (${error.message}); left untouched, so ${hook.path} is not wired. Fix the file, then run this again.`
		);
		return;
	}
	const next = wireHook(settings, hook);
	if (!next) return;
	writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`);
	report.wired.push(`${hook.settingsPath}: ${hook.settingsEvent} -> ${hook.path}`);
}

/** Install one guide from an entry that carries its content. */
export function applyGuide(root, report, entry, client) {
	const targets = Array.isArray(entry.installTargets) ? entry.installTargets : [];
	const target = targets.find((candidate) => candidate.client === client) ?? targets[0];
	const path = target?.path ?? entry.installPath;
	if (!path) throw new Error(`${entry.id} came back with content but no path to write it to.`);
	if (writeIfChanged(root, path, entry.installContent)) report.written.push(path);
	if (target?.pointerPath && target.pointerBlock) {
		applyMerge(root, report, target.pointerPath, target.pointerBlock, `<!-- lyriks-skill:${entry.id} -->`, `<!-- /lyriks-skill:${entry.id} -->`);
	}
}

/** Apply one sync answer; returns how many files carried content. */
export function applyAnswer(root, report, answer, client) {
	let delivered = 0;
	for (const entry of Array.isArray(answer.skills) ? answer.skills : []) {
		if (typeof entry.installContent === 'string') {
			applyGuide(root, report, entry, client);
			delivered += 1;
		} else if (entry.status === 'up-to-date') report.current += 1;
	}
	const binding = answer.binding;
	if (binding && typeof binding === 'object') {
		const targets = Array.isArray(binding.targets) ? binding.targets : [];
		const target = targets.find((candidate) => candidate.client === client) ?? targets[0];
		const markers = binding.markers ?? { open: '<!-- lyriks-binding -->', close: '<!-- /lyriks-binding -->' };
		if (target?.pointerPath && target.pointerBlock) applyMerge(root, report, target.pointerPath, target.pointerBlock, markers.open, markers.close);
		for (const hook of [target?.hook, target?.toolsHook]) {
			// A deferred hook comes with a later answer: wiring it before its file exists would fail on every prompt.
			if (!hook || hook.deferred) continue;
			if (typeof hook.content === 'string') {
				if (writeIfChanged(root, hook.path, hook.content)) report.written.push(hook.path);
				delivered += 1;
			} else if (hook.unchanged) report.current += 1;
			applyWiring(root, report, hook);
		}
		for (const tool of Array.isArray(binding.tools) ? binding.tools : []) {
			if (typeof tool.content === 'string') {
				if (writeIfChanged(root, tool.path, tool.content)) report.written.push(tool.path);
				delivered += 1;
			} else if (tool.unchanged) report.current += 1;
		}
	}
	return delivered;
}

