/** What the angel is doing right now. Keep in step with the moods in hooks/pet-art.js. */
export type Mood =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'running'
  | 'asking'
  | 'oops'
  | 'done'
  | 'sleepy'

export type Size = 'small' | 'big'

declare module 'claude-code' {
  interface PluginState {
    'wired-angel-pet': { mood: Mood; size: Size; isHidden: boolean }
  }
}
