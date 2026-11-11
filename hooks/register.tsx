import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage } from 'claude-code'

import type { Buckets, Snapshot } from '../types'

// Bump the tag when Snapshot's fields change, so a stale stored value is dropped.
const snapshot = atom({ plugin: 'context-usage-indicator', key: 'snapshot' } as const, null, { shape: 'snapshot-1' })

type Level = 'neutral' | 'amber' | 'red'

const levelOf = (percent: number): Level =>
  percent > 85 ? 'red' : percent >= 60 ? 'amber' : 'neutral'

const fmt = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  : n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  : `${n}`

const glyph = (percent: number): string =>
  percent >= 88 ? '●' : percent >= 63 ? '◕' : percent >= 38 ? '◑' : percent >= 13 ? '◔' : '○'

// /context's rows grouped into three buckets. Rows are told apart by name
// because the engine stamps no finer kind than used/free/buffer/deferred.
const bucketsOf = (b: SessionContextBreakdown): Buckets =>
  b.categories
    .filter(row => row.kind === 'used')
    .reduce<Buckets>((acc, row) => {
      const name = row.name.toLowerCase()
      if (name.includes('message')) return { ...acc, messages: acc.messages + row.tokens }
      if (name.includes('tool')) return { ...acc, tools: acc.tools + row.tokens }
      return { ...acc, system: acc.system + row.tokens }
    }, { system: 0, tools: 0, messages: 0 })

const snapshotOf = (ctx: SessionContextUsage, buckets: Buckets | null): Snapshot => ({
  tokens: ctx.tokens ?? 0,
  window: ctx.window,
  percent: ctx.percent ?? 0,
  buckets,
})

const summaryOf = (snap: Snapshot): string =>
  `Context window: ${snap.percent}%, ${fmt(snap.tokens)} of ${fmt(snap.window)} tokens`

const detailOf = (snap: Snapshot): string => {
  const b = snap.buckets
  const free = Math.max(0, snap.window - snap.tokens)
  const buckets = b === null
    ? ''
    : ` · System ${fmt(b.system)} · Tools ${fmt(b.tools)} · Messages ${fmt(b.messages)}`
  return `${summaryOf(snap)} (${fmt(free)} free)${buckets}`
}

async function refresh($: EngineInterface): Promise<void> {
  // `summary` estimates locally: no extra API calls.
  const usage = await $.session.usage({ breakdown: 'summary' })
  const breakdown = usage.context.breakdown
  await update($, snapshot, () => snapshotOf(usage.context, breakdown ? bucketsOf(breakdown) : null))
}

export const register: Register = on => {
  // Which surfaces have asked the footer slot to draw since the mod loaded:
  // the diagnostic for "loaded but not visible".
  const drawnOn = new Set<string>()

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'context-indicator',
      description: 'Show this session\'s context window usage, with the System, Tools and Messages breakdown',
    })
    await refresh($)
    return result
  })

  // The on-demand view, and the only one cloud sessions in the desktop app
  // show: they attach no drawing surface, and command output is streamed.
  on('command.run', { command: 'context-indicator' }, async $ => {
    await refresh($)
    const snap = await read($, snapshot)
    const surfaces = await $.session.surfaces()
    const drawn = drawnOn.size === 0 ? 'none' : [...drawnOn].join(', ')
    const where = `Surfaces: ${surfaces.length === 0 ? 'none' : surfaces.join(', ')} · footer drawn on: ${drawn}`
    if (snap === null || snap.tokens <= 0) {
      return { text: ['Context window: no figures yet (they arrive with the first reply).', where].join('\n') }
    }
    const b = snap.buckets
    const free = Math.max(0, snap.window - snap.tokens)
    return {
      text: [
        `${glyph(snap.percent)} Context window: ${snap.percent}% · ${fmt(snap.tokens)} of ${fmt(snap.window)} tokens (${fmt(free)} free)`,
        b === null ? 'Breakdown not available' : `System ${fmt(b.system)} · Tools ${fmt(b.tools)} · Messages ${fmt(b.messages)}`,
        where,
      ].join('\n'),
    }
  })

  // Raised when the context fill moves, i.e. after each model response.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('context')) await refresh($)
    return result
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    drawnOn.add(e.surface)
    const base = await next(e)
    const snap = await read($, snapshot)
    if (snap === null || snap.window <= 0) return base

    // The desktop draws this slot as one line of text: no Svg, and a Button
    // shows its `label` when it has one. So the resting view is only a glyph
    // ring and the percentage (no label, so the children show), and the detail
    // goes in a toast on click.
    const { Box, Text, Button } = $.ui.resolve(e)
    const level = levelOf(snap.percent)
    const color = level === 'red' ? 'error' : level === 'amber' ? 'warning' : undefined

    return (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {base}
        <Button key="ctx-indicator" plain onPress={() => { $.ui.toast(detailOf(snap)) }}>
          <Text color={color} dimColor={color === undefined} tabular>
            {glyph(snap.percent)} {snap.percent}%
          </Text>
        </Button>
      </Box>
    )
  })
}
