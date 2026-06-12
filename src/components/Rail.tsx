/**
 * The matchday strip above the groups.
 *
 * Live tournaments get a day switcher — Yesterday / Today / Tomorrow — that
 * shows exactly one day's fixtures at a time and defaults to today. The
 * adjacent tabs fall back to the nearest matchday when the literal
 * yesterday/tomorrow is a rest day, and disappear at the edges of the
 * tournament. A green dot on a tab means that day has unwatched results in.
 *
 * Finished tournaments get "Continue": the next unwatched games in
 * tournament order.
 */
import { useState } from 'react'
import type { Tournament } from '../data/types'
import { isPlayed, knockoutReady } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { PreviewCard } from './PreviewCard'
import type { RailEntry } from './PreviewCard'
import { formatDate, formatWeekdayLong } from './format'

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

type DayKey = 'prev' | 'today' | 'next'

function DaySwitcher({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const entries = allEntries(t)
  const today = localISODate()
  const dates = [...new Set(entries.map((e) => e.date))]
  const prevDate = [...dates].reverse().find((d) => d < today) ?? null
  const nextDate = dates.find((d) => d > today) ?? null
  const todayHasGames = dates.includes(today)

  const defaultKey: DayKey = todayHasGames || nextDate === null ? 'today' : 'next'
  const [selected, setSelected] = useState<DayKey>(defaultKey)
  // Selection can dangle after switching tournaments; snap back to default.
  const key: DayKey =
    (selected === 'prev' && !prevDate) || (selected === 'next' && !nextDate)
      ? defaultKey
      : selected

  const dayOf: Record<DayKey, string | null> = { prev: prevDate, today, next: nextDate }
  const date = dayOf[key]!
  const dayEntries = entries.filter((e) => e.date === date)

  const tabs = (['prev', 'today', 'next'] as const).filter((k) => dayOf[k] !== null)
  const labelOf: Record<DayKey, string> = {
    prev: prevDate === localISODate(-1) ? 'Yesterday' : formatDate(prevDate ?? ''),
    today: 'Today',
    next: nextDate === localISODate(1) ? 'Tomorrow' : formatDate(nextDate ?? ''),
  }
  // "Something new to watch that day" — unwatched finished games.
  const hasFresh = (d: string) =>
    entries.some(
      (e) =>
        e.date === d &&
        progress.marks[e.target.match.id] === undefined &&
        isPlayed(e.target.match) &&
        (e.target.kind === 'group' ||
          knockoutReady(t, e.target.match, progress.marks, progress.revealed)),
    )

  return (
    <section className="day-rail" aria-label="Matchday">
      <header className="day-head">
        <div className="day-title">
          <h2>{labelOf[key]}</h2>
          <span className="day-date">{formatWeekdayLong(date)}</span>
        </div>
        <div className="day-tabs" role="tablist" aria-label="Pick a day">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={key === k}
              className={`day-tab ${key === k ? 'active' : ''}`}
              onClick={() => setSelected(k)}
            >
              <span className="day-tab-label">
                {labelOf[k]}
                {hasFresh(dayOf[k]!) && <span className="day-tab-dot" aria-label="New results" />}
              </span>
              <span className="day-tab-date">{formatDate(dayOf[k]!)}</span>
            </button>
          ))}
        </div>
      </header>
      {dayEntries.length > 0 ? (
        <div className="day-grid">
          {dayEntries.map((e) => (
            <PreviewCard key={e.target.match.id} t={t} entry={e} progress={progress} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="day-empty">No matches {key === 'today' ? 'today' : 'this day'} — rest day.</div>
      )}
    </section>
  )
}

function ContinueRail({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
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
  if (next.length === 0) return null

  return (
    <section className="day-rail" aria-label="Continue watching">
      <header className="day-head">
        <div className="day-title">
          <h2>Continue</h2>
          <span className="day-date">Pick up where you left off</span>
        </div>
      </header>
      <div className="day-grid">
        {next.map((e) => (
          <PreviewCard
            key={e.target.match.id}
            t={t}
            entry={e}
            progress={progress}
            onOpen={onOpen}
            showDate
          />
        ))}
      </div>
    </section>
  )
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
  const live =
    t.groupMatches.some((m) => !isPlayed(m)) ||
    t.knockoutRounds.some((r) => r.matches.some((m) => !isPlayed(m)))
  return live ? (
    <DaySwitcher t={t} progress={progress} onOpen={onOpen} />
  ) : (
    <ContinueRail t={t} progress={progress} onOpen={onOpen} />
  )
}
