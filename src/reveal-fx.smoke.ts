import { JSDOM } from 'jsdom'
import { playRevealFx } from './reveal-fx'
import { writeStorageCopies } from './state/storage'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const dom = new JSDOM('<div id="scroller" style="overflow-y: auto"><button class="fulltime-reveal" style="backdrop-filter: blur(12px)">Reveal Result</button></div>')
const frames: FrameRequestCallback[] = []
const storage = new Map<string, string>()
let blocked = true
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  matchMedia: { configurable: true, value: () => ({ matches: false }) },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
  CSS: { configurable: true, value: { supports: () => true } },
  requestAnimationFrame: {
    configurable: true,
    value: (callback: FrameRequestCallback) => { frames.push(callback); return frames.length },
  },
  localStorage: {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (blocked) throw new Error('storage full')
        storage.set(key, value)
      },
    },
  },
})
Object.defineProperties(dom.window.HTMLCanvasElement.prototype, {
  getContext: {
    value: () => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => {},
    }),
  },
  toDataURL: { value: () => 'data:image/png;base64,AA==' },
})

const button = document.querySelector<HTMLButtonElement>('.fulltime-reveal')!
const keys = ['nss-progress-last-good', 'nss-progress']
const masks = ['mask-image', '-webkit-mask-image', 'mask-size', 'mask-repeat', 'mask-composite']
let attempts = 0
const reveal = () => {
  attempts += 1
  if (writeStorageCopies(keys, '{"watched":true}')) button.remove()
}
const animateReveal = () => {
  playRevealFx(button, { x: 0, y: 0 }, reveal)
  assert(!!button.style.maskImage, 'normal-motion reveal masks the player button while its animation runs')
  while (frames.length) frames.shift()!(performance.now() + 1000)
}

animateReveal()
assert(attempts === 1 && button.isConnected && !storage.size, 'a failed reveal keeps the original unmarked player button mounted')
assert(masks.every((property) => button.style.getPropertyValue(property) === ''), 'a failed reveal restores every temporary mask on the player button')
assert(!button.hasAttribute('data-baked'), 'a failed reveal restores the original frosted appearance in a scrolling player')
animateReveal()
assert(attempts === 2 && button.isConnected && masks.every((property) => button.style.getPropertyValue(property) === ''),
  'the restored player button can retry a failed reveal without remaining invisible')
blocked = false
animateReveal()
assert(attempts === 3 && !button.isConnected && keys.every((key) => storage.get(key) === '{"watched":true}'),
  'retrying after storage recovers commits the reveal and replaces the old button')

dom.window.close()
console.log('ALL PLAYER REVEAL RECOVERY TESTS PASS')
