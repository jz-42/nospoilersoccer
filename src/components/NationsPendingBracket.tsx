import type { KnockoutMatch, Tournament } from '../data/types'
import type { Progress } from '../state/progress'
import { KnockoutCard } from './Bracket'
import type { ModalTarget } from './MatchModal'
import { nationsBracketView } from './nations-bracket-view'

const stageWindows: Record<string, string> = {
  qf: '25–30 Mar 2027',
  sf: '9–13 Jun 2027',
  final: '13 Jun 2027',
  'third-place': '13 Jun 2027',
}

function EmptySlot({ id, label, window }: { id: string; label: string; window: string }) {
  return (
    <div className="nations-empty-slot" data-empty-slot={id}>
      <span className="nations-empty-state">Draw pending</span>
      <span className="nations-empty-label">{label}</span>
      <span className="nations-empty-window">{window}</span>
    </div>
  )
}

export function NationsPendingBracket({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const view = nationsBracketView(t)
  const championship = t.knockoutTracks?.find((track) => track.id === 'championship')
  const windowFor = (id: string) => championship?.pendingStages?.find((stage) => stage.id === id)?.window ?? stageWindows[id]
  const card = (match: KnockoutMatch, roundName: string) => (
    <KnockoutCard key={match.id} t={t} m={match} roundName={roundName} progress={progress} onOpen={onOpen} />
  )
  const tieNode = (index: number) => {
    const entry = view.quarterFinals[index]
    const decided = entry?.legs.every((leg) => progress.marks[leg.id] !== undefined) ?? false
    return (
      <div
        key={`qf-${index}`}
        className={`b-slot has-out ${view.pathsKnown && decided ? 'flow-out' : ''}`}
        data-tie-position={index + 1}
        {...(entry ? { 'data-tie-id': entry.tie.id } : {})}
      >
        <div className="nations-tie-label">Quarter-final tie {index + 1}</div>
        <div className="b-tie-legs">
          {entry ? entry.legs.map((leg) => card(leg, 'Quarter-finals')) : ([1, 2] as const).map((leg) => (
            <EmptySlot key={leg} id={`qf-${index + 1}-leg-${leg}`} label={`Leg ${leg}`} window={windowFor('qf')} />
          ))}
        </div>
      </div>
    )
  }
  const semiNode = (index: number) => {
    const match = view.semiFinals[index]
    const feeders = view.quarterFinals.slice(index * 2, index * 2 + 2)
    const inFlow = view.pathsKnown && feeders.some((entry) => entry?.legs.every((leg) => progress.marks[leg.id] !== undefined))
    return (
      <div className={`b-slot has-out has-in ${inFlow ? 'flow-in' : ''} ${match && progress.marks[match.id] !== undefined ? 'flow-out' : ''}`}>
        {match ? card(match, 'Semi-finals') : (
          <EmptySlot id={`sf-${index + 1}`} label={`Semi-final ${index + 1}`} window={windowFor('sf')} />
        )}
      </div>
    )
  }
  const finalInLeft = view.semiFinals[0] && progress.marks[view.semiFinals[0].id] !== undefined
  const finalInRight = view.semiFinals[1] && progress.marks[view.semiFinals[1].id] !== undefined

  return (
    <section className="nations-pending-bracket" data-pairings={view.pathsKnown ? 'known' : 'unassigned'} aria-label="Nations League championship bracket">
      {!view.pathsKnown && <p className="nations-pairing-note">Semi-final draw pending — quarter-final paths are not assigned yet.</p>}
      <div className="bracket nations-stage-bracket">
        <div className="b-col side-left nations-qf-column">
          <div className="b-round-name">Quarter-finals</div>
          <div className="b-col-body"><div className="b-pair">{tieNode(0)}{tieNode(1)}</div></div>
        </div>
        <div className="b-col side-left nations-sf-column">
          <div className="b-round-name">Semi-finals</div>
          <div className="b-col-body"><div className="b-single">{semiNode(0)}</div></div>
        </div>
        <div className="b-col b-center nations-center-column">
          <div className="b-round-name">Final</div>
          <div className="b-col-body">
            <div className="b-single">
              <div className={`b-slot has-in-left has-in-right ${finalInLeft ? 'flow-in-left' : ''} ${finalInRight ? 'flow-in-right' : ''}`}>
                <div className="b-final">
                  {view.final ? card(view.final, 'Final') : <EmptySlot id="final" label="Final" window={windowFor('final')} />}
                </div>
              </div>
            </div>
            <div className="b-third nations-third-place">
              <div className="b-round-name">Third place</div>
              {view.thirdPlace ? card(view.thirdPlace, 'Third-place match') : (
                <EmptySlot id="third-place" label="Third-place match" window={windowFor('third-place')} />
              )}
            </div>
          </div>
        </div>
        <div className="b-col side-right nations-sf-column">
          <div className="b-round-name">Semi-finals</div>
          <div className="b-col-body"><div className="b-single">{semiNode(1)}</div></div>
        </div>
        <div className="b-col side-right nations-qf-column">
          <div className="b-round-name">Quarter-finals</div>
          <div className="b-col-body"><div className="b-pair">{tieNode(2)}{tieNode(3)}</div></div>
        </div>
      </div>
    </section>
  )
}
