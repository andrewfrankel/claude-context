import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage } from 'claude-code'

import type { Buckets, Snapshot } from '../types'

// Bump the tag when Snapshot's fields change, so a stale stored value is dropped.
const snapshot = atom({ plugin: 'context-usage-indicator', key: 'snapshot' } as const, null, { shape: 'snapshot-1' })
const isOpen = atom({ plugin: 'context-usage-indicator', key: 'isOpen' } as const, false)

// Raw colors so the SVG and the floating card look the same in light and dark,
// matching the dark tooltip the plan-usage ring uses.
const RING = { neutral: '#9b9b9b', amber: '#e8a33d', red: '#e5484d', track: 'rgba(128,128,128,0.35)' }
const CARD = { bg: '#2b2b2b', border: '#3a3a3a', text: '#ececec', dim: '#9a9a9a' }

type Level = 'neutral' | 'amber' | 'red'

const levelOf = (percent: number): Level =>
  percent > 85 ? 'red' : percent >= 60 ? 'amber' : 'neutral'

const fmt = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  : n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  : `${n}`

const ringSvg = (percent: number, color: string): string => {
  const r = 6
  const c = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, percent)) / 100) * c
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="${r}" fill="none" stroke="${RING.track}" stroke-width="2.4"/><circle cx="8" cy="8" r="${r}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 8)"/></svg>`
}

const barSvg = (fraction: number, color: string): string => {
  const w = Math.round(Math.min(1, Math.max(0, fraction)) * 240)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="4" viewBox="0 0 240 4"><rect width="240" height="4" rx="2" fill="${RING.track}"/>${w > 0 ? `<rect width="${Math.max(w, 4)}" height="4" rx="2" fill="${color}"/>` : ''}</svg>`
}

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

async function refresh($: EngineInterface): Promise<void> {
  // `summary` estimates locally: no extra API calls.
  const usage = await $.session.usage({ breakdown: 'summary' })
  const breakdown = usage.context.breakdown
  await update($, snapshot, () => snapshotOf(usage.context, breakdown ? bucketsOf(breakdown) : null))
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  // Raised when the context fill moves, i.e. after each model response.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('context')) await refresh($)
    return result
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const base = await next(e)
    const snap = await read($, snapshot)
    if (snap === null || snap.window <= 0) return base

    const { Box, Text, Button } = $.ui.resolve(e)
    // The terminal has no Svg; every other surface draws one.
    const Svg = e.surface === 'terminal' ? null : $.ui.resolve(e).Svg
    const open = await read($, isOpen)
    const level = levelOf(snap.percent)
    const color = RING[level]
    const textColor = level === 'red' ? 'error' : level === 'amber' ? 'warning' : undefined
    const label = `${snap.percent}%`
    const toggle = (): void => { void update($, isOpen, v => !v) }

    const ring = Svg
      ? <Svg source={ringSvg(snap.percent, color)} alt={`Context ${label} used`} width={16} height={16} />
      : <Text color={textColor} dimColor={textColor === undefined}>{glyph(snap.percent)}</Text>

    const row = (name: string, value: string, extra?: string) => (
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={CARD.text}>{name}</Text>
        <Text color={CARD.dim} tabular>{extra ? `${extra}  ` : ''}<Text color={CARD.text}>{value}</Text></Text>
      </Box>
    )

    const bar = (fraction: number, c: string) =>
      Svg ? <Svg source={barSvg(fraction, c)} alt="" width={240} height={4} /> : null

    const tooltip = (
      <Box position="absolute" bottom={1} right={0} display="none" hover={{ display: 'flex' }}
        flexDirection="column" paddingX={1} borderStyle="round" borderColor={CARD.border}
        backgroundColor={CARD.bg} width={30}>
        <Text color={CARD.text}>Context window: {label}</Text>
        <Text color={CARD.dim} size="footnote">{fmt(snap.tokens)} of {fmt(snap.window)} tokens</Text>
      </Box>
    )

    const b = snap.buckets
    const card = (
      <Box position="absolute" bottom={1} right={0} flexDirection="column" rowGap={1}
        paddingX={2} paddingY={1} borderStyle="round" borderColor={CARD.border}
        backgroundColor={CARD.bg} width={40}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={CARD.dim}>Context window · this session</Text>
          <Button key="ctx-close" plain dimColor onPress={toggle}>Close</Button>
        </Box>
        <Box flexDirection="column">
          {row('Used', label, `${fmt(snap.tokens)} / ${fmt(snap.window)}`)}
          {bar(snap.percent / 100, color)}
        </Box>
        {b && (
          <Box flexDirection="column">
            {row('System', fmt(b.system))}
            {bar(b.system / snap.window, RING.neutral)}
            {row('Tools', fmt(b.tools))}
            {bar(b.tools / snap.window, RING.neutral)}
            {row('Messages', fmt(b.messages))}
            {bar(b.messages / snap.window, RING.neutral)}
          </Box>
        )}
        {!b && <Text color={CARD.dim} size="footnote">Breakdown not available</Text>}
      </Box>
    )

    return (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {base}
        <Box key="ctx-indicator" flexDirection="row" alignItems="center" columnGap={1}>
          {ring}
          <Button key="ctx-toggle" plain onPress={toggle}>
            <Text color={textColor} dimColor={textColor === undefined} tabular>{label}</Text>
          </Button>
          {open ? card : tooltip}
        </Box>
      </Box>
    )
  })
}
