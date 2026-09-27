import {
  HIGHLIGHT_SOURCES,
  createD1HighlightStore,
  renewWebSubSubscriptions,
  runFeedRecovery,
} from './highlights.mjs'

export async function handleFeedScanRequest(request, {
  store,
  queue,
  webSubCallbackUrl,
  fetchImpl = fetch,
}) {
  const url = new URL(request.url)
  const source = HIGHLIGHT_SOURCES.find((item) => item.id === url.searchParams.get('source'))
  if (!source || !['/scan', '/renew'].includes(url.pathname)) {
    return new Response('unknown source', { status: 404 })
  }
  if (request.method !== 'GET') return new Response('method not allowed', { status: 405 })

  const result = url.pathname === '/scan'
    ? await runFeedRecovery({ store, queue, fetchImpl, sources: [source] })
    : await renewWebSubSubscriptions({
      callbackUrl: webSubCallbackUrl,
      store,
      fetchImpl,
      sources: [source],
    })
  const status = result.errors.length ? 502 : 200
  console.log(JSON.stringify({ source: source.id, task: url.pathname.slice(1), result }))
  return new Response(JSON.stringify(result), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default {
  fetch(request, env) {
    if (!env.HIGHLIGHT_DB || !env.HIGHLIGHT_QUEUE) {
      return new Response('highlight ingestion not configured', { status: 503 })
    }
    return handleFeedScanRequest(request, {
      store: createD1HighlightStore(env.HIGHLIGHT_DB),
      queue: env.HIGHLIGHT_QUEUE,
      webSubCallbackUrl: env.WEBSUB_CALLBACK_URL,
    })
  },
}
