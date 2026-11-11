export type Buckets = { system: number; tools: number; messages: number }

export type Snapshot = {
  tokens: number
  window: number
  percent: number
  buckets: Buckets | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-usage-indicator': { snapshot: Shaped<Snapshot | null> }
  }
}
