import { createAnalytics } from './analytics'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

type TrackedEvent = { name: string; props?: object }

const events: TrackedEvent[] = []
const provider: { tracker?: (name: string, props?: object) => void } = {}
let onLoad: (() => void) | undefined

const analytics = createAnalytics({
  websiteId: 'test-site',
  getTracker: () => provider.tracker,
  loadScript: (handleLoad) => {
    onLoad = handleLoad
  },
})

analytics.init()
analytics.viewChanged({ view: 'groups' })

assert(events.length === 0, 'event waits while the analytics script is loading')

provider.tracker = (name, props) => events.push({ name, props })
onLoad?.()

assert(events.length === 1, 'queued event is sent when analytics becomes ready')
assert(events[0]?.name === 'view_changed', 'queued event keeps its name')
assert(
  (events[0]?.props as { view?: string } | undefined)?.view === 'groups',
  'queued event keeps its properties',
)

analytics.viewChanged({ view: 'bracket' })
assert(events.length === 2, 'later events are sent immediately')

console.log('ALL ANALYTICS TESTS PASS')
