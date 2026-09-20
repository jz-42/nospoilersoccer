import assert from 'node:assert/strict'
import { FINISHED_PENDING_CARD_COPY, FINISHED_PENDING_MODAL_COPY } from './highlight-copy'

assert.equal(FINISHED_PENDING_CARD_COPY, 'Result in · highlights pending')
assert.equal(FINISHED_PENDING_MODAL_COPY, 'Highlights pending')

console.log('highlight pending copy smoke tests passed')
