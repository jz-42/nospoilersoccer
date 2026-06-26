/**
 * AI spoiler gate — the last line of defence before a video is published.
 *
 * Given a candidate's title and the two teams we expect, the model answers
 * two questions: does the title reveal the result, and is this really the
 * full-match highlights for these two teams? It runs only on videos that
 * already passed the deterministic guards (FOX channel, exact title pattern,
 * embeddable, played match), so it's cheap — ~one call per real highlight, a
 * couple hundred for the tournament.
 *
 * The upstream thumbnail is intentionally NOT inspected: the site replaces it
 * with a generic placeholder, so a result-leaking still on YouTube/FOX never
 * reaches users. Title is the only signal that matters.
 *
 * Everything here FAILS CLOSED: any error, any unparseable answer, any doubt
 * is treated as a spoiler, so the worst case is a missing video, never a leak.
 *
 * Config (env):
 *   OPENAI_API_KEY            required to run the check (absent = caller skips)
 *   OPENAI_MODEL              default 'gpt-5.4'
 *   OPENAI_REASONING_EFFORT   default 'medium'
 *   OPENAI_BASE_URL           default 'https://api.openai.com/v1'
 */

export interface SpoilerVerdict {
  /** True if the title reveals the result in any way. */
  spoiler: boolean
  /** True only if this is clearly the full-match highlights for both teams. */
  teamsMatch: boolean
  reason: string
  /**
   * The check didn't get a clean answer (no key, API/network/parse error). The
   * caller must treat this as "try again later" — NOT a permanent rejection —
   * so a transient outage or a bad key never blacklists a good video forever.
   */
  transient?: boolean
}

export const aiEnabled = Boolean(process.env.OPENAI_API_KEY)

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.4'
const EFFORT = process.env.OPENAI_REASONING_EFFORT ?? 'medium'
const BASE_URL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'

const SYSTEM = `You verify whether a soccer highlights video TITLE is safe to embed on a STRICTLY spoiler-free World Cup highlights site. Users come here precisely so they do NOT learn the result before watching.

You are given a TITLE and the two teams the video is supposed to be (HOME vs AWAY). The site replaces the upstream thumbnail with a generic placeholder, so there is no thumbnail to inspect — judge from the TITLE only.

Set "spoiler": true if the TITLE reveals, even partially, ANY of:
- the final score or any scoreline
- who won, lost, or that it was a draw
- who advanced or was eliminated
- a specific goal, scorer, or game-deciding moment
A plain "<A> vs <B> Highlights" title is NOT a spoiler.

Set "teamsMatch": true ONLY if the TITLE clearly identifies the full-match highlights for exactly these two teams (not a goal clip, interview, reaction, preview, or a different match).

When unsure about either, be conservative: "spoiler": true and/or "teamsMatch": false.

Reply with ONLY a JSON object: {"spoiler": boolean, "teamsMatch": boolean, "reason": "<one short sentence>"}`

function parseVerdict(text: string): SpoilerVerdict {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`no JSON in model reply: ${text.slice(0, 200)}`)
  const obj = JSON.parse(text.slice(start, end + 1)) as Partial<SpoilerVerdict>
  if (typeof obj.spoiler !== 'boolean' || typeof obj.teamsMatch !== 'boolean') {
    throw new Error(`malformed verdict: ${text.slice(0, 200)}`)
  }
  return { spoiler: obj.spoiler, teamsMatch: obj.teamsMatch, reason: String(obj.reason ?? '') }
}

async function callModel(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
}

/**
 * Returns a verdict, failing closed (spoiler:true) on any problem. Never
 * throws — the caller can treat the result as authoritative.
 */
export async function checkVideoForSpoilers(args: {
  title: string
  homeName: string
  awayName: string
}): Promise<SpoilerVerdict> {
  if (!aiEnabled) {
    return { spoiler: true, teamsMatch: false, reason: 'no OPENAI_API_KEY', transient: true }
  }
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `HOME: ${args.homeName}\nAWAY: ${args.awayName}\nTITLE: ${args.title}`,
    },
  ]

  // Rich body first; if the API rejects an unknown param (400), retry minimal
  // so a param-name drift degrades to a working call instead of blocking
  // every video.
  const rich = {
    model: MODEL,
    messages,
    reasoning_effort: EFFORT,
    response_format: { type: 'json_object' },
  }
  try {
    let res = await callModel(rich)
    if (res.status === 400) {
      console.error(`spoiler-check: 400 on rich body, retrying minimal (${await res.text()})`)
      res = await callModel({ model: MODEL, messages })
    }
    if (!res.ok) {
      return { spoiler: true, teamsMatch: false, reason: `API ${res.status}: ${(await res.text()).slice(0, 150)}`, transient: true }
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = data.choices?.[0]?.message?.content
    if (!text) return { spoiler: true, teamsMatch: false, reason: 'empty model reply', transient: true }
    return parseVerdict(text)
  } catch (e) {
    return { spoiler: true, teamsMatch: false, reason: `check failed: ${e}`, transient: true }
  }
}
