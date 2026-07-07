import {
  AI_REJECTION_ALERT_ISSUE_TITLE,
  buildAiRejectionIssueComment,
  findUnalertedRejections,
  extractAlertKeysFromComment,
} from './notify-ai-rejections'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

assert(
  AI_REJECTION_ALERT_ISSUE_TITLE === 'AI highlight curator alerts',
  'AI rejection alerts use the dedicated issue title',
)

const body = buildAiRejectionIssueComment({
  mention: 'jz-42',
  runUrl: 'https://github.com/jz-42/nospoilersoccer/actions/runs/123',
  cycle: 7,
  rejections: [
    { matchId: 'm95', source: 'youtube', id: 'XO3x8vm0Ijc', reason: 'possible spoiler in title' },
    { matchId: 'm99', source: 'youtube', id: 'abc123xyz99', reason: 'not the full-match highlights' },
  ],
})

assert(body.includes('@jz-42'), 'AI rejection alert mentions the configured GitHub user')
assert(body.includes('cycle 7'), 'AI rejection alert includes the update cycle')
assert(body.includes('actions/runs/123'), 'AI rejection alert links to the workflow run')
assert(body.includes('m95'), 'AI rejection alert includes spoiler-safe match ids')
assert(!body.includes('Argentina vs Egypt'), 'AI rejection alert does not include spoiler-prone match titles')
assert(body.includes('Alert keys: youtube:XO3x8vm0Ijc, youtube:abc123xyz99'), 'AI rejection alert includes stable alert keys')

const unalerted = findUnalertedRejections(
  [
    {
      matchId: 'm95',
      source: 'youtube',
      id: 'XO3x8vm0Ijc',
      reason: 'possible spoiler in title',
      at: '2026-07-07T18:37:23.995Z',
    },
    {
      matchId: 'm99',
      source: 'youtube',
      id: 'abc123xyz99',
      reason: 'not the full-match highlights',
      at: '2026-07-07T18:39:23.995Z',
    },
  ],
  [
    'noise',
    '@jz-42\nAlert keys: youtube:XO3x8vm0Ijc',
  ],
)

assert(unalerted.length === 1, 'AI rejection alert skips already-commented ids')
assert(unalerted[0]?.id === 'abc123xyz99', 'AI rejection alert keeps unmentioned ids pending')

const extractedKeys = extractAlertKeysFromComment(
  '@jz-42\nAlert keys: youtube:XO3x8vm0Ijc, fox:fmc-alert-123\nother text',
)
assert(extractedKeys.has('youtube:XO3x8vm0Ijc'), 'AI rejection alert key parser reads YouTube ids from comments')
assert(extractedKeys.has('fox:fmc-alert-123'), 'AI rejection alert key parser reads FOX ids from comments')

console.log('ALL PASS')
