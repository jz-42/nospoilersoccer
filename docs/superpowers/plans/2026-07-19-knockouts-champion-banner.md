# Knockouts Champion Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 2026 champion celebration clear of the Knockouts detail control and replace its generic trophy SVG with a bundled transparent photographic image of the real FIFA World Cup trophy.

**Architecture:** Keep the detail control and champion celebration absolutely positioned so the Final card and connector geometry do not move. Use the detail control's existing `is-open` class plus the adjacent `.b-champ` element to select a larger expanded-state offset. Render an optimized local PNG for standard champions while leaving the 2022 Messi-specific SVG branch intact.

**Tech Stack:** React 19, TypeScript, CSS, Vite asset URLs, Node/tsx smoke tests

---

## File Map

- Create `src/assets/world-cup-trophy.png`: transparent photographic trophy cutout.
- Create `docs/assets/world-cup-trophy.md`: source, author, license, and modification attribution.
- Create `src/components/champion.smoke.tsx`: focused markup and layout-contract regression checks.
- Modify `src/components/Champion.tsx`: render the local trophy image for the standard champion branch.
- Modify `src/App.css`: offset the champion below collapsed and expanded detail content and constrain the image.
- Modify `package.json`: include the new smoke test in `test:components`.

### Task 1: Add the champion banner regression test

**Files:**
- Create: `src/components/champion.smoke.tsx`
- Modify: `package.json`

- [ ] **Step 1: Create the focused smoke test**

Create `src/components/champion.smoke.tsx` with:

```tsx
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { tournaments } from '../data'
import { ChampionMoment } from './Champion'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const wc2026 = tournaments.wc2026
const wc2022 = tournaments.wc2022
const spain = wc2026.teams.ESP
const argentina = wc2022.teams.ARG
const championSource = readFileSync(new URL('./Champion.tsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

const standardChampion = renderToStaticMarkup(
  <ChampionMoment t={wc2026} team={spain} />,
)
const messiChampion = renderToStaticMarkup(
  <ChampionMoment t={wc2022} team={argentina} />,
)

assert(
  standardChampion.includes('class="champion-trophy"'),
  'standard champion renders the photographic trophy image',
)
assert(
  standardChampion.includes('alt=""') && standardChampion.includes('aria-hidden="true"'),
  'photographic trophy is decorative for assistive technology',
)
assert(
  !messiChampion.includes('class="champion-trophy"') && messiChampion.includes('<svg'),
  '2022 Argentina keeps the special Messi lift artwork',
)
assert(
  championSource.includes("new URL('../assets/world-cup-trophy.png', import.meta.url).href"),
  'standard trophy is bundled through the Vite asset pipeline',
)
assert(
  /\.b-champ\s*\{[\s\S]*?top:\s*34px;/.test(appCss),
  'collapsed detail control leaves space above the champion',
)
assert(
  /\.ko-detail\.is-open\s*\+\s*\.b-champ\s*\{[\s\S]*?top:\s*112px;/.test(appCss),
  'expanded detail key moves the champion farther down',
)

console.log('champion smoke tests passed')
```

- [ ] **Step 2: Add the test to the component test command**

Change the `test:components` script in `package.json` to begin with:

```json
"test:components": "tsx --tsconfig tsconfig.app.json src/components/champion.smoke.tsx && tsx --tsconfig tsconfig.app.json src/components/format.smoke.ts && tsx --tsconfig tsconfig.app.json src/components/disclosures.smoke.tsx && tsx --tsconfig tsconfig.app.json src/components/rail-layout.smoke.ts && tsx --tsconfig tsconfig.app.json src/navigation.smoke.ts"
```

Keep every existing component smoke command after the new command.

- [ ] **Step 3: Run the new test and verify the expected failure**

Run:

```bash
npx tsx --tsconfig tsconfig.app.json src/components/champion.smoke.tsx
```

Expected: FAIL at `standard champion renders the photographic trophy image`, because the standard branch still renders the old generic SVG.

- [ ] **Step 4: Commit the red test**

```bash
git add src/components/champion.smoke.tsx package.json
git commit -m "test: cover knockouts champion banner"
```

### Task 2: Create and attribute the bundled trophy asset

**Files:**
- Create: `src/assets/world-cup-trophy.png`
- Create: `docs/assets/world-cup-trophy.md`

- [ ] **Step 1: Download the licensed source photograph to ignored workspace context**

Run:

```bash
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/FIFA%20World%20Cup%20Trophy%20photo%20by%20Djuradj%20Vujcic.jpg" -o ".context/world-cup-trophy-source.jpg"
```

Expected: `.context/world-cup-trophy-source.jpg` is a JPEG photograph of the FIFA World Cup Trophy on display in Toronto.

- [ ] **Step 2: Produce the transparent cutout**

Use the image-generation editing workflow with `.context/world-cup-trophy-source.jpg` as the only reference and this instruction:

```text
Isolate the real FIFA World Cup trophy exactly as photographed. Remove the entire background and display case, preserve the trophy's original gold surface, green base, proportions, engraving, lighting, and photographic detail, and output a tightly cropped transparent-background PNG. Do not redesign, stylize, add, or remove any part of the trophy.
```

Save the resulting PNG as `src/assets/world-cup-trophy.png`. Inspect it at original resolution and reject/regenerate if the background is not transparent or the trophy shape is materially altered.

- [ ] **Step 3: Add the required attribution**

Create `docs/assets/world-cup-trophy.md` with:

```markdown
# FIFA World Cup Trophy image

- Source: [FIFA World Cup Trophy photo by Djuradj Vujcic](https://commons.wikimedia.org/wiki/File:FIFA_World_Cup_Trophy_photo_by_Djuradj_Vujcic.jpg)
- Author: Djuradj Vujcic
- License: [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)
- Changes: Background and display case removed; image tightly cropped and exported as a transparent PNG for the champion banner.

No endorsement by the photographer or Wikimedia Commons is implied.
```

- [ ] **Step 4: Validate the image file**

Run:

```bash
file src/assets/world-cup-trophy.png
sips -g pixelWidth -g pixelHeight -g hasAlpha src/assets/world-cup-trophy.png
```

Expected: PNG format, a portrait-oriented crop, and `hasAlpha: yes`.

- [ ] **Step 5: Commit the asset and attribution**

```bash
git add src/assets/world-cup-trophy.png docs/assets/world-cup-trophy.md
git commit -m "assets: add photographed World Cup trophy"
```

### Task 3: Render and position the trophy banner

**Files:**
- Modify: `src/components/Champion.tsx`
- Modify: `src/App.css`
- Test: `src/components/champion.smoke.tsx`

- [ ] **Step 1: Replace the generic trophy component**

In `src/components/Champion.tsx`, remove the `Trophy` SVG function and add the asset URL after the imports:

```tsx
const trophyUrl = new URL('../assets/world-cup-trophy.png', import.meta.url).href
```

Change the standard artwork branch in `ChampionMoment` to:

```tsx
<div className="champion-art">
  {isMessiMoment ? (
    <Lift />
  ) : (
    <img
      className="champion-trophy"
      src={trophyUrl}
      alt=""
      aria-hidden="true"
    />
  )}
</div>
```

- [ ] **Step 2: Add closed/open offsets and image constraints**

In `src/App.css`, change `.b-champ` and add the expanded selector:

```css
.b-champ {
  position: absolute;
  top: 34px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  transition: top 0.2s ease;
  animation: champ-in 0.7s cubic-bezier(0.2, 1, 0.4, 1);
}

.ko-detail.is-open + .b-champ {
  top: 112px;
}
```

After `.champion-art`, add:

```css
.champion-trophy {
  display: block;
  width: 44px;
  height: 57px;
  object-fit: contain;
}
```

- [ ] **Step 3: Run the focused test and verify green**

Run:

```bash
npx tsx --tsconfig tsconfig.app.json src/components/champion.smoke.tsx
```

Expected: six `ok -` lines followed by `champion smoke tests passed`.

- [ ] **Step 4: Run the component suite**

Run:

```bash
npm run test:components
```

Expected: all component smoke tests exit 0.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/components/Champion.tsx src/App.css
git commit -m "fix: clear knockouts champion detail control"
```

### Task 4: Verify the complete change

**Files:**
- Verify: `src/assets/world-cup-trophy.png`
- Verify: `src/components/Champion.tsx`
- Verify: `src/App.css`

- [ ] **Step 1: Run the complete project checks**

Run:

```bash
npm run check
npm run lint
npm run build
```

Expected: each command exits 0 with no test, type-check, lint, or build failures.

- [ ] **Step 2: Start the development server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL and remains running.

- [ ] **Step 3: Inspect the 2026 Knockouts tab in both detail states**

Open the local app at desktop width, select `2026` and `Knockouts`, and use the existing completed local progress shown in the user's workspace. Confirm:

- The trophy is a transparent photographic cutout of the real FIFA World Cup trophy.
- The collapsed `Show more detail` control has a visible gap above the trophy.
- Expanding the detail key moves the champion far enough down that the key and trophy do not overlap.
- The Spain flag, name, and `World Champions` label remain centered.
- The final card and its connector lines do not move when detail is toggled.
- The 2022 Knockouts tab still shows the Messi lift artwork.

- [ ] **Step 4: Check the final diff**

Run:

```bash
git diff origin/main... --check
git status --short
```

Expected: no whitespace errors and no unintended or untracked files outside the plan.
