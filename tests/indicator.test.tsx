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

test('/context-indicator prints the figures, the breakdown and where it draws', async ($, on) => {
  on('session.usage', () => usageAt(84_000))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: [] }))
  on('command.register', () => ({ value: { command: 'context-indicator' } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const out = await $.command.run({
    command: 'context-indicator',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(out.text).toBe([
    '◑ Context window: 42% · 84.0k of 200k tokens (116k free)',
    'System 3.0k · Tools 14.0k · Messages 67.0k',
    'Surfaces: none · footer drawn on: none',
  ].join('\n'))
})
