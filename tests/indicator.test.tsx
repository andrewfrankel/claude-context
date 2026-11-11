import { expect, test } from 'claude-code/testing'

const MODE = {
  plugin: 'context-usage-indicator',
  component: 'SessionMode',
  props: { modes: ['Auto'] },
} as const

const usageAt = (tokens: number) => ({
  value: {
    startedAt: 0,
    rateLimits: [],
    context: {
      tokens,
      window: 200_000,
      percent: Math.round((tokens / 200_000) * 100),
      breakdown: {
        categories: [
          { name: 'System prompt', tokens: 3000, color: 'x', isDeferred: false, kind: 'used' as const },
          { name: 'System tools', tokens: 12000, color: 'x', isDeferred: false, kind: 'used' as const },
          { name: 'MCP tools', tokens: 2000, color: 'x', isDeferred: false, kind: 'used' as const },
          { name: 'Messages', tokens: tokens - 17000, color: 'x', isDeferred: false, kind: 'used' as const },
          { name: 'Free space', tokens: 1, color: 'x', isDeferred: false, kind: 'free' as const },
        ],
        totalTokens: tokens,
        maxTokens: 200_000,
        rawMaxTokens: 200_000,
        autocompactSource: 'model-default' as const,
        percentage: Math.round((tokens / 200_000) * 100),
        gridRows: [],
        model: 'test',
        memoryFiles: [],
        mcpTools: [],
        agents: [],
        isAutoCompactEnabled: true,
        apiUsage: null,
      },
    },
  },
})

test('shows ring and percentage, keeps the mode label, toasts the breakdown', async ($, on) => {
  let tokens = 84_000
  const toasts: string[] = []
  on('session.usage', () => usageAt(tokens))
  on('command.register', () => ({ value: { command: 'context-indicator' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.toast', (_, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>Auto</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...MODE, surface })
    expect(await ui.find({ type: 'Text', text: 'Auto' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '◑ 42%' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...MODE, surface: 'desktop' })
  await ui.press({ key: 'ctx-indicator' })
  expect(toasts.at(-1)).toBe(
    'Context window: 42%, 84.0k of 200k tokens (116k free) · System 3.0k · Tools 14.0k · Messages 67.0k',
  )

  tokens = 180_000
  await $.session.measure({ context: { tokens, window: 200_000, percent: 90 }, rateLimits: [], changed: ['context'] })
  expect(await ui.find({ type: 'Text', text: '● 90%' })).toBeDefined()
  await ui.unmount()
})

test('/context-indicator reports where the footer slot drew', async ($, on) => {
  on('session.usage', () => usageAt(84_000))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('command.register', () => ({ value: { command: 'context-indicator' } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...MODE, surface: 'terminal' })
  await ui.unmount()

  const out = await $.command.run({ command: 'context-indicator', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(out.text).toContain('42%')
  expect(out.text).toContain('Footer slot drawn on: terminal.')
})

const TURN = {
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  category: null,
  explanation: null,
} as const

test('with no surface attached, each turn ends with a context notice', async ($, on) => {
  const appended: string[] = []
  let surfaces: readonly ('desktop')[] = []
  on('session.usage', () => usageAt(130_000))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'context-indicator' } }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('turn.complete', () => ({ text: 'ok' }))
  on('session.append', (_, e, next) => {
    const block = e.message.content[0]
    if (block?.type === 'text') appended.push(String(block.text))
    return next(e)
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete(TURN)
  expect(appended).toEqual(['◕ Context 65% · 130k of 200k · getting full'])

  surfaces = ['desktop']
  await $.turn.complete(TURN)
  expect(appended.length).toBe(1)
})
