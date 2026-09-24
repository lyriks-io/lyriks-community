// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Decides which
// Lyriks project a script addresses, and says so out loud when the places that
// name one disagree. Three places can: --project, the `projectId` of
// `.unspa.json`, and the binding block `sync_skills` merged into the instruction
// file (CLAUDE.md, AGENTS.md, ...). A field session once kept a `.unspa.json`
// written for a project since replaced, and every sync went to the old project
// in silence. No dependencies, no network, Node 18+.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

/** The instruction files a binding block can live in, one per runtime. */
const BINDING_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md'];

/** The project named by the binding block, looked for next to the index file and in `cwd`. */
export function bindingProject(dirs) {
	for (const dir of [...new Set(dirs.map((candidate) => resolve(candidate)))]) {
		for (const file of BINDING_FILES) {
			const path = join(dir, file);
			if (!existsSync(path)) continue;
			let body;
			try {
				body = readFileSync(path, 'utf8');
			} catch {
				continue;
			}
			const block = /<!-- lyriks-binding -->([\s\S]*?)<!-- \/lyriks-binding -->/.exec(body);
			const named = block && /Lyriks project `([^`]+)`/.exec(block[1]);
			if (named) return { id: named[1].trim(), file: relative(process.cwd(), path) || file };
		}
	}
	return null;
}

/** The command line that was run, with `--project <id>` set to `id`. */
export function commandWithProject(id) {
	const script = relative(process.cwd(), process.argv[1] ?? '') || basename(process.argv[1] ?? 'script.mjs');
	const args = [];
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--project') i += 1;
		// A bearer token is never echoed: the environment variable carries it as well.
		else if (argv[i] === '--token') {
			args.push('--token', '"$LYRIKS_MCP_TOKEN"');
			i += 1;
		} else args.push(/^[\w./:@=,+-]+$/.test(argv[i]) ? argv[i] : JSON.stringify(argv[i]));
	}
	return ['node', script, ...args, '--project', id].join(' ');
}

/**
 * The project to address and every disagreement found on the way.
 * `--project` wins when given (with a warning for each place that says
 * otherwise). Without it, a `.unspa.json` and a binding block naming two
 * different projects is a `conflict`: nothing tells which one is stale, and a
 * write to the wrong project replaces what that project recorded, so a
 * networked script refuses and prints the exact command to run instead.
 */
export function resolveProject({ flag, indexProject, indexPath, dirs }) {
	const binding = bindingProject(dirs);
	const given = typeof flag === 'string' && flag.trim() ? flag.trim() : null;
	const indexName = indexPath ? relative(process.cwd(), indexPath) || '.unspa.json' : '.unspa.json';
	const warnings = [];
	if (given && indexProject && given !== indexProject) {
		warnings.push(`--project ${given} differs from the projectId ${indexProject} of ${indexName}: ${given} is used. If ${given} is right, fix the index: node .lyriks/tools/index-file.mjs set-project ${given}`);
	}
	if (given && binding && given !== binding.id) {
		warnings.push(`--project ${given} differs from the project ${binding.id} the binding block of ${binding.file} names: ${given} is used.`);
	}
	const conflict = !given && indexProject && binding && indexProject !== binding.id;
	if (conflict) {
		warnings.push(
			`${indexName} names projectId ${indexProject} but the binding block of ${binding.file} names ${binding.id}. ` +
				`Name the project you work on: ${commandWithProject(binding.id)} (or --project ${indexProject}), ` +
				`then fix the stale one (node .lyriks/tools/index-file.mjs set-project <id> for the index, sync_skills with project_id for the block).`
		);
	}
	const projectId = given ?? (conflict ? null : indexProject ?? binding?.id ?? null);
	const source = given ? '--project' : conflict ? null : indexProject ? indexName : binding ? binding.file : null;
	return { projectId, source, conflict: Boolean(conflict), binding: binding?.id ?? null, warnings };
}

/** Every warning on stderr, loud enough to be read in a scroll of output. */
export function printProjectWarnings(warnings) {
	for (const warning of warnings) process.stderr.write(`WARNING (Lyriks project): ${warning}\n`);
}

/** The project a networked script may write to, or a refusal that names the command to run. */
export function projectForWrite(options) {
	const resolved = resolveProject(options);
	if (resolved.conflict) {
		throw new Error(`Nothing was sent: two different projects are named. ${resolved.warnings.at(-1)}`);
	}
	printProjectWarnings(resolved.warnings);
	if (!resolved.projectId) {
		throw new Error(
			`No project is named: pass --project <id> (the Lyriks project this repository is specified in), or set projectId in ${options.indexPath ?? '.unspa.json'}.`
		);
	}
	return resolved;
}
