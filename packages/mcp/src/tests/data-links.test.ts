import { describe, expect, it } from 'vitest'
import type { LyriksClient } from '../lyriks-client.js'
import { getDataLinksHandler, linkDataFieldsHandler } from '../tools/behavior.js'

// An AI client links the data model to the behavior as it captures them: it
// reads what remains with its candidates, then links many fields by names.
describe('the links from the data model to the behavior', () => {
  it('reads one table, what remains only, one page at a time', async () => {
    const asked: string[] = []
    const lyriks = {
      get: async (path: string) => {
        asked.push(path)
        return { rows: [] }
      },
    } as unknown as LyriksClient
    await getDataLinksHandler({ project_id: 'shop', table: 'Order', unlinked_only: true, offset: 60, limit: 30 }, lyriks)
    expect(asked).toEqual(['/api/draft/data/links?projectId=shop&table=Order&unlinked=1&offset=60&limit=30'])
  })

  it('links by table and field names, a null path taking a link back, a further carrier with also, with existence states', async () => {
    const posted: { path: string; body: unknown }[] = []
    const lyriks = {
      post: async (path: string, body: unknown) => {
        posted.push({ path, body })
        return { ok: true, outcomes: [] }
      },
    } as unknown as LyriksClient
    await linkDataFieldsHandler(
      {
        project_id: 'shop',
        links: [
          { table: 'Order', field: 'status', state_path: 'order.status' },
          { table: 'Order', field: 'total', state_path: null },
          { table: 'Order', field: 'status', state_path: 'shipping.order.status', also: true },
        ],
        existence: [{ table: 'Order', state_path: 'order.placed' }],
      },
      lyriks,
    )
    expect(posted).toEqual([
      {
        path: '/api/draft/data/links',
        body: {
          projectId: 'shop',
          links: [
            { table: 'Order', field: 'status', statePath: 'order.status' },
            { table: 'Order', field: 'total', statePath: null },
            { table: 'Order', field: 'status', statePath: 'shipping.order.status', also: true },
          ],
          existence: [{ table: 'Order', statePath: 'order.placed' }],
        },
      },
    ])
  })
})
