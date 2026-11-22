/**
 * Stands in for elkjs, which mermaid 12 depends on for its ELK layouts.
 *
 * elkjs is EPL-2.0 OR GPL-3.0-or-later, and the appliance ships permissive
 * third-party code only (docs/deployment/04-license-inventory.md). The
 * package override in package.json keeps it out of node_modules, and the alias
 * in vite.config.ts points mermaid's lazily loaded ELK chunk here. Diagrams
 * are drawn with mermaid's dagre layout (src/lib/ui/data/board/Mermaid.svelte),
 * so this module is never constructed; if a diagram ever asks for ELK, it
 * says why it cannot instead of failing on a missing import.
 */
export default class ElkExcluded {
	constructor() {
		throw new Error('The ELK layout is not bundled with Lyriks: draw this diagram with the dagre layout.');
	}
}
