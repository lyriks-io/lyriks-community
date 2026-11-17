import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import EnlargeableDiagram from './EnlargeableDiagram.svelte';

describe('a schema openable large', () => {
	it('sits in its card with the button that opens it large, and tells the schema it is not enlarged', () => {
		const children = createRawSnippet((enlarged: () => boolean) => ({ render: () => `<p>schema enlarged=${enlarged()}</p>` }));
		const { body } = render(EnlargeableDiagram, { props: { title: 'Data map', children } });
		expect(body).toContain('aria-label="Open Data map large"');
		expect(body).toContain('schema enlarged=false');
		expect(body).not.toContain('role="dialog"');
	});
});
