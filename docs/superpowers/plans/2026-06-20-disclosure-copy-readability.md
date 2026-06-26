# Disclosure Copy Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Privacy disclosure copy and make both onboarding disclosures easier to scan using three visibly separated paragraphs.

**Architecture:** Store each disclosure as an array of paragraph strings and render it through a small reusable `DisclosureContent` component. Keep the existing disclosure toggle behavior and panel styling, adding only paragraph-level spacing inside the current panel.

**Tech Stack:** React 19, TypeScript, CSS, server-rendered component smoke tests

---

### Task 1: Render structured disclosure paragraphs

**Files:**
- Modify: `src/components/disclosures.smoke.tsx`
- Modify: `src/components/Dialogs.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write the failing component smoke test**

Import `DisclosureContent` from `Dialogs.tsx`. Render both disclosure variants
with `renderToStaticMarkup`, then assert:

```tsx
const privacy = renderToStaticMarkup(<DisclosureContent disclosure="privacy" />)
const advanced = renderToStaticMarkup(<DisclosureContent disclosure="advanced" />)

assert(
  privacy.includes('Your preferences are saved locally in your browser.'),
  'Privacy explains that preferences remain local',
)
assert(
  privacy.includes('This site uses anonymous Umami analytics'),
  'Privacy explains anonymous analytics',
)
assert(
  privacy.includes('No cookies, persistent IDs, user profiles'),
  'Privacy explains what is not stored, profiled, or sold',
)
assert(
  (privacy.match(/<p>/g) ?? []).length === 3,
  'Privacy is grouped into three paragraphs',
)
assert(
  (advanced.match(/<p>/g) ?? []).length === 3,
  'Advanced is grouped into three paragraphs',
)
assert(
  !privacy.includes('Progress, favorites, and settings stay in this browser'),
  'Privacy omits the superseded disclosure copy',
)
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:components
```

Expected: TypeScript fails because `DisclosureContent` is not exported.

- [ ] **Step 3: Implement structured content and rendering**

In `src/components/Dialogs.tsx`, change the disclosure copy to
`Record<Disclosure, readonly string[]>`, using the approved three Privacy
paragraphs and these three Advanced paragraphs:

```tsx
const DISCLOSURE_COPY: Record<Disclosure, readonly string[]> = {
  privacy: [
    'Your preferences are saved locally in your browser.',
    'This site uses anonymous Umami analytics for basic usage and error tracking, such as page views, match opens, highlight plays, result reveals, and video failures. Analytics may include general technical details like device type, browser language, screen size, referrer, and approximate country.',
    'No cookies, persistent IDs, user profiles, team picks, scores, or progress data are stored, profiled, or sold.',
  ],
  advanced: [
    'This is a static React website with no application backend. Your progress is stored in your browser.',
    'Results and highlights are updated automatically through GitHub Actions and delivered when the site refreshes.',
    'YouTube is loaded only after you choose a highlight.',
  ],
}

export function DisclosureContent({ disclosure }: { disclosure: Disclosure }) {
  return (
    <>
      {DISCLOSURE_COPY[disclosure].map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </>
  )
}
```

Replace the panel's single paragraph with:

```tsx
{open && <DisclosureContent key={open} disclosure={open} />}
```

- [ ] **Step 4: Add visible paragraph spacing**

In `src/App.css`, move the shared card-like styling to
`.onboarding-disclosure-panel` and make paragraph spacing explicit:

```css
.onboarding-disclosure-panel {
  max-width: 340px;
  margin: 0 auto 12px;
  padding: 10px 14px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
  text-align: center;
  background: rgba(154, 173, 203, 0.04);
  border-radius: 8px;
  animation: onboarding-disclosure-in 0.22s ease both;
}

.onboarding-disclosure-panel:empty {
  margin: 0;
  padding: 0;
}

.onboarding-disclosure-panel p {
  margin: 0;
}

.onboarding-disclosure-panel p + p {
  margin-top: 1em;
}
```

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
npm run test:components
npm run check
npm run build
```

Expected: all commands exit successfully with no test, type-check, or build failures.

- [ ] **Step 6: Review the final diff**

Run:

```bash
git diff --check
git diff -- src/components/Dialogs.tsx src/components/disclosures.smoke.tsx src/App.css
```

Expected: no whitespace errors; diff contains only the approved disclosure copy,
paragraph rendering, regression assertions, and paragraph spacing.
