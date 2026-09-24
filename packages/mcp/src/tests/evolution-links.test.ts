import { describe, expect, it } from 'vitest'
import { withPageLinks } from '../tools/evolution.js'

// A client cannot know which installation it talks to, so the server makes
// every page path the platform returns into a link a person opens in one click.
describe('page links handed to a person', () => {
  it('makes every relative href whole, however deep it sits', () => {
    const answer = {
      request: {
        href: '/projects/p/features?tab=evolution&request=r',
        gate: { href: '/projects/p/features?tab=evolution&request=r&at=next-step' },
        proposals: { entries: [{ id: 'x', href: '/projects/p/features?tab=evolution&request=r&at=proposal__x' }] },
      },
      requests: [{ id: 'r', href: '/projects/p/features?tab=evolution&request=r' }],
    }
    const linked = withPageLinks(answer, 'https://studio.example')
    expect(linked.request.href).toBe('https://studio.example/projects/p/features?tab=evolution&request=r')
    expect(linked.request.gate.href).toBe('https://studio.example/projects/p/features?tab=evolution&request=r&at=next-step')
    expect(linked.request.proposals.entries[0].href).toContain('https://studio.example/projects/p/')
    expect(linked.requests[0].href).toBe('https://studio.example/projects/p/features?tab=evolution&request=r')
  })

  it('leaves everything that is not a page path alone', () => {
    const answer = { href: 'https://already.whole/x', title: '/projects/not-a-link', n: 3, none: null }
    expect(withPageLinks(answer, 'https://studio.example')).toEqual(answer)
  })
})
