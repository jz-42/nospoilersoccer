# Extended Highlight Runtime Mask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove spoiler-bearing extended-highlight minute counts while preserving all existing highlight-selection behavior.

**Architecture:** Keep the change local to component formatting and presentation. Put the masking rules in shared formatter helpers, then consume those helpers from the preview-card badge and the modal highlight UI so both surfaces stay consistent.

**Tech Stack:** React 19, TypeScript, static smoke tests run with `tsx`

---

### Task 1: Lock the new display contract with failing tests

**Files:**
- Create: `src/components/format.smoke.ts`
- Modify: `src/components/disclosures.smoke.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
assert(formatRuntimeBadge(videos) === '5m · Extended')
assert(formatHighlightOptionDuration(extendedVideo) === null)
assert(previewMarkup.includes('5m · Extended'))
assert(!modalMarkup.includes('Extended Highlights<span class="poster-time">'))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `tsx --tsconfig tsconfig.app.json src/components/format.smoke.ts && tsx --tsconfig tsconfig.app.json src/components/disclosures.smoke.tsx`
Expected: FAIL because the current formatter still exposes extended minute counts and the highlight chooser still renders extended runtimes.

### Task 2: Implement the minimal formatter and rendering changes

**Files:**
- Modify: `src/components/format.ts`
- Modify: `src/components/HighlightPlayer.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add shared formatting helpers**

```ts
export function formatHighlightOptionDuration(video: HighlightVideo): string | null {
  if (video.kind === 'extended') return null
  return formatDuration(video.durationSeconds)
}
```

- [ ] **Step 2: Update the outer runtime badge**

```ts
if (quick) parts.push(`${Math.round(quick / 60)}m`)
if (videos.some((video) => video.kind === 'extended')) parts.push('Extended')
```

- [ ] **Step 3: Update modal runtime rendering and chip alignment**

```tsx
const dur = formatHighlightOptionDuration(v)
```

```css
.kind-chip {
  align-items: center;
}
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `tsx --tsconfig tsconfig.app.json src/components/format.smoke.ts && tsx --tsconfig tsconfig.app.json src/components/disclosures.smoke.tsx`
Expected: PASS

### Task 3: Fold the regression into the normal verification path

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the new smoke test to the component test script**

```json
"test:components": "tsx --tsconfig tsconfig.app.json src/components/format.smoke.ts && tsx --tsconfig tsconfig.app.json src/components/disclosures.smoke.tsx && tsx --tsconfig tsconfig.app.json src/components/rail-layout.smoke.ts"
```

- [ ] **Step 2: Run the full project verification**

Run: `npm run check`
Expected: PASS
