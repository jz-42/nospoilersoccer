# Mobile Today Swipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-only swipe-anywhere day change in the Today tab and make the mobile match-modal close button significantly larger without changing existing desktop or carousel behavior.

**Architecture:** Keep the existing day carousel as the single source of truth. Extract the swipe-commit decision into a tiny pure helper in `railLayout.ts` so it can be smoke-tested, then let `Rail.tsx` attach a mobile-only touch recognizer at the Today-tab container level that calls the existing day navigation path. Increase only the mobile close-control dimensions in CSS and pin that expectation with the existing component smoke test.

**Tech Stack:** TypeScript, React 19, Vite, TSX smoke tests, CSS

---

## File Structure

- Modify: `src/components/railLayout.ts`
  Add a pure helper that decides whether a touch gesture should commit a one-day swipe and in which direction.
- Modify: `src/components/rail-layout.smoke.ts`
  Add deterministic coverage for deliberate left/right swipes, vertical motion, and under-threshold motion.
- Modify: `src/components/Rail.tsx`
  Add a mobile-only touch recognizer on the Today-tab section that reuses the existing `scrollToIndex()` path and fails closed on ambiguous gestures.
- Modify: `src/App.css`
  Increase only the mobile modal close button and icon size.
- Modify: `src/components/disclosures.smoke.tsx`
  Assert the new mobile close-button dimensions so the tap-target regression is covered.

### Task 1: Add Failing Smoke Tests For Swipe Intent And Mobile Close Size

**Files:**
- Modify: `src/components/rail-layout.smoke.ts`
- Modify: `src/components/disclosures.smoke.tsx`
- Test: `src/components/rail-layout.smoke.ts`
- Test: `src/components/disclosures.smoke.tsx`

- [ ] **Step 1: Write the failing swipe-intent smoke assertions**

Append these assertions near the end of `src/components/rail-layout.smoke.ts`:

```ts
import {
  findNearestItemIndex,
  getCarouselVisualState,
  getCommittedDaySwipe,
  getDayCardMetrics,
} from './railLayout'

assert(
  getCommittedDaySwipe({ deltaX: -88, deltaY: 16 }) === 1,
  'clear left swipe advances to the next day',
)
assert(
  getCommittedDaySwipe({ deltaX: 92, deltaY: 14 }) === -1,
  'clear right swipe moves to the previous day',
)
assert(
  getCommittedDaySwipe({ deltaX: 28, deltaY: 74 }) === 0,
  'mostly vertical motion does not commit a day swipe',
)
assert(
  getCommittedDaySwipe({ deltaX: -34, deltaY: 6 }) === 0,
  'small horizontal motion under threshold does not commit a day swipe',
)
```

- [ ] **Step 2: Write the failing mobile close-size smoke assertions**

Add these assertions in `src/components/disclosures.smoke.tsx` next to the existing modal close-control CSS checks:

```ts
assert(
  /@media \(max-width: 760px\)\s*\{[\s\S]*?\.modal-close\s*\{[\s\S]*?width:\s*56px;[\s\S]*?height:\s*56px;/.test(
    appCss,
  ),
  'mobile modal close control uses a substantially larger tap target',
)
assert(
  /@media \(max-width: 760px\)\s*\{[\s\S]*?\.modal-close-icon\s*\{[\s\S]*?width:\s*22px;[\s\S]*?height:\s*22px;/.test(
    appCss,
  ),
  'mobile modal close icon scales with the larger tap target',
)
```

- [ ] **Step 3: Run the component smoke tests to verify they fail**

Run: `npm run test:components`

Expected:
- `src/components/rail-layout.smoke.ts` fails because `getCommittedDaySwipe` does not exist yet.
- `src/components/disclosures.smoke.tsx` fails because the mobile close-control CSS still uses the old smaller dimensions.

- [ ] **Step 4: Commit the failing-test checkpoint**

```bash
git add src/components/rail-layout.smoke.ts src/components/disclosures.smoke.tsx
git commit -m "test: cover mobile day swipe intent"
```

### Task 2: Implement The Helper, Wire The Today Swipe, And Increase The Mobile Close Target

**Files:**
- Modify: `src/components/railLayout.ts`
- Modify: `src/components/Rail.tsx`
- Modify: `src/App.css`
- Test: `src/components/rail-layout.smoke.ts`
- Test: `src/components/disclosures.smoke.tsx`

- [ ] **Step 1: Add the minimal pure swipe helper**

In `src/components/railLayout.ts`, add a small pure helper:

```ts
export function getCommittedDaySwipe({
  deltaX,
  deltaY,
}: {
  deltaX: number
  deltaY: number
}): -1 | 0 | 1 {
  const horizontal = Math.abs(deltaX)
  const vertical = Math.abs(deltaY)
  if (horizontal < 56) return 0
  if (horizontal < vertical * 1.35) return 0
  return deltaX < 0 ? 1 : -1
}
```

This keeps the accidental-gesture logic deterministic and reusable from the UI.

- [ ] **Step 2: Wire the helper into the Today-tab container without changing existing carousel logic**

In `src/components/Rail.tsx`:

1. Import `getCommittedDaySwipe` from `./railLayout`.
2. Add a small `goToIndex(nextIndex: number, smooth: boolean)` helper that:
   - clamps the index,
   - updates `active`,
   - calls the existing `scrollToIndex(...)`.
3. Add a touch tracker on the outer Today section that only runs on mobile-sized viewports and ignores gestures that start inside the modal or on non-Today views.
4. On touch end, call `getCommittedDaySwipe(...)`; if it returns:
   - `1`, call `goToIndex(idx + 1, true)`;
   - `-1`, call `goToIndex(idx - 1, true)`;
   - `0`, do nothing.

Use this shape:

```ts
const isMobileViewport = () => window.matchMedia('(max-width: 760px)').matches

const swipeRef = useRef<{
  startX: number
  startY: number
} | null>(null)

const goToIndex = (nextIndex: number, smooth: boolean) => {
  const clamped = Math.min(Math.max(nextIndex, 0), dates.length - 1)
  setActive(clamped)
  scrollToIndex(clamped, smooth)
}

const onSectionTouchStart = (e: ReactTouchEvent<HTMLElement>) => {
  if (!isMobileViewport() || e.touches.length !== 1) return
  const touch = e.touches[0]
  swipeRef.current = { startX: touch.clientX, startY: touch.clientY }
}

const onSectionTouchEnd = (e: ReactTouchEvent<HTMLElement>) => {
  if (!isMobileViewport() || !swipeRef.current) return
  const touch = e.changedTouches[0]
  if (!touch) return
  const direction = getCommittedDaySwipe({
    deltaX: touch.clientX - swipeRef.current.startX,
    deltaY: touch.clientY - swipeRef.current.startY,
  })
  swipeRef.current = null
  if (direction === 1) goToIndex(idx + 1, true)
  if (direction === -1) goToIndex(idx - 1, true)
}
```

Keep the existing pointer drag, wheel, arrows, day taps, and jump-to-Today button intact. The new touch layer is additive.

- [ ] **Step 3: Increase only the mobile modal close-control dimensions**

In the mobile media query in `src/App.css`, update:

```css
.modal-close {
  top: 12px;
  right: 12px;
  width: 56px;
  height: 56px;
}

.modal-close-icon {
  width: 22px;
  height: 22px;
}
```

Leave desktop `.modal-close`, desktop `.modal-close-icon`, and the compact desktop variant unchanged.

- [ ] **Step 4: Run the component smoke tests to verify they pass**

Run: `npm run test:components`

Expected:
- `rail-layout smoke: ok`
- `ok - mobile modal close control uses a substantially larger tap target`
- `ok - mobile modal close icon scales with the larger tap target`

- [ ] **Step 5: Run full verification for this change**

Run: `npm run check`

Expected: exit code `0` with all validation, smoke tests, and TypeScript checks passing.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/components/railLayout.ts src/components/rail-layout.smoke.ts src/components/Rail.tsx src/App.css src/components/disclosures.smoke.tsx
git commit -m "feat: add mobile Today swipe navigation"
```

## Self-Review

- Spec coverage:
  - mobile-only Today swipe anywhere: covered in Task 2 Step 2
  - accidental-gesture prevention: covered in Task 1 Step 1 and Task 2 Step 1
  - larger mobile close control: covered in Task 1 Step 2 and Task 2 Step 3
  - preserve existing carousel behavior: covered in Task 2 Step 2
- Placeholder scan:
  - no `TBD`, `TODO`, or hand-wavy "test this" steps remain
- Type consistency:
  - `getCommittedDaySwipe` is named consistently in tests and implementation
