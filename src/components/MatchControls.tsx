import type { Mark } from '../logic/spoilers'

/** Watched / Skip buttons for an unmarked match. */
export function MarkButtons({ onMark }: { onMark: (mark: Mark) => void }) {
  return (
    <span className="mark-buttons">
      <button type="button" className="btn btn-watched" onClick={() => onMark('watched')}>
        Watched ✓
      </button>
      <button type="button" className="btn btn-skip" onClick={() => onMark('skipped')}>
        Skip
      </button>
    </span>
  )
}

/** Badge + undo for a marked match. */
export function MarkBadge({ mark, onUndo }: { mark: Mark; onUndo: () => void }) {
  return (
    <span className={`mark-badge mark-${mark}`}>
      {mark === 'watched' ? 'watched' : 'skipped'}
      <button type="button" className="btn btn-undo" title="Undo (re-hides this result)" onClick={onUndo}>
        ↺
      </button>
    </span>
  )
}
