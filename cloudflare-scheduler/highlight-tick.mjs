import { createD1HighlightStore, runScheduledHighlightTick } from './highlights.mjs'

export default {
  async scheduled(controller, env) {
    if (!env.HIGHLIGHT_DB || !env.HIGHLIGHT_QUEUE || !env.FEED_SCANNER) {
      throw new Error('highlight tick bindings are missing')
    }
    const result = await runScheduledHighlightTick({
      now: new Date(controller?.scheduledTime ?? Date.now()),
      store: createD1HighlightStore(env.HIGHLIGHT_DB),
      queue: env.HIGHLIGHT_QUEUE,
      scanService: env.FEED_SCANNER,
    })
    console.log(JSON.stringify({ highlightTick: result }))
  },
}
