/**
 * The catch-up rail above the groups — Apple Sports inspired.
 *
 * Live tournaments (some fixtures unplayed) get Yesterday / Today / Upcoming
 * sections keyed to the visitor's clock, with quiet date labels so a stale
 * data day is never confusing. Finished tournaments get "Continue": the next
 * unwatched games in tournament order.
 */
import type { Tournament } from '../data/types'
import { isPlayed, knockoutReady } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { PreviewCard } from './PreviewCard'
import type { RailEntry } from './PreviewCard'
import { formatDate } from './format'

function allEntries(t: Tournament): RailEntry[] {
  const out: RailEntry[] = []
  for (const m of t.groupMatches) out.push({ target: { kind: 'group', match: m }, date: m.date })
  for (const round of t.knockoutRounds) {
    for (const m of round.matches) {
      out.push({ target: { kind: 'knockout', match: m, roundName: round.name }, date: m.date })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

function localISODate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD
}

interface RailSection {
  label: string
  date?: string
  entries: RailEntry[]
}

function liveSections(t: Tournament): RailSection[] {
  const entries = allEntries(t)
  const today = localISODate()
  const yesterday = localISODate(-1)
  const sections: RailSection[] = []

  const yEntries = entries.filter((e) => e.date === yesterday)
  const tEntries = entries.filter((e) => e.date === today)
  const nextDate = entries.map((e) => e.date).find((d) => d > today)
  const uEntries = nextDate ? entries.filter((e) => e.date === nextDate) : []

  if (yEntries.length) sections.push({ label: 'Yesterday', date: yesterday, entries: yEntries })
  if (tEntries.length) sections.push({ label: 'Today', date: today, entries: tEntries })
  if (uEntries.length) sections.push({ label: 'Upcoming', date: nextDate, entries: uEntries })
  return sections
}

function continueSection(t: Tournament, progress: Progress): RailSection[] {
  const next = allEntries(t)
    .filter((e) => {
      const m = e.target.match
      if (progress.marks[m.id] !== undefined || !isPlayed(m)) return false
      if (e.target.kind === 'knockout') {
        return knockoutReady(t, e.target.match, progress.marks, progress.revealed)
      }
      return true
    })
    .slice(0, 6)
  return next.length ? [{ label: 'Continue', entries: next }] : []
}

export function Rail({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const live = t.groupMatches.some((m) => !isPlayed(m)) || t.knockoutRounds.some((r) => r.matches.some((m) => !isPlayed(m)))
  const sections = live ? liveSections(t) : continueSection(t, progress)
  if (sections.length === 0) return null

  return (
    <div className="rail">
      {sections.map((s) => (
        <section key={s.label} className="rail-section">
          <div className="rail-label">
            {s.label}
            {s.date && <span className="rail-date">{formatDate(s.date)}</span>}
          </div>
          <div className="rail-cards">
            {s.entries.map((e) => (
              <PreviewCard key={e.target.match.id} t={t} entry={e} progress={progress} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
