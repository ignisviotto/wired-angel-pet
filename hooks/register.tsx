import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood, Size } from '../types'
import { PET_ART, PET_SIZE, PET_WORDS } from './pet-art.js'

const mood = atom({ plugin: 'wired-angel-pet', key: 'mood' } as const, 'idle')
const size = atom({ plugin: 'wired-angel-pet', key: 'size' } as const, 'big')
const isHidden = atom({ plugin: 'wired-angel-pet', key: 'isHidden' } as const, false)

// How long a mood stays before the angel settles into the next one, in milliseconds.
const HEARD = 1000
const TOOL_LINGER = 700
const SNAG = 1800
const STEADY = 7000
const DORMANT_AFTER = 5 * 60 * 1000

/** The moods that only make sense while Claude is working. */
const BUSY: readonly Mood[] = ['listening', 'thinking', 'reading', 'writing', 'running', 'asking']

const READS =
  /^(Read|Grep|Glob|LS|WebFetch|WebSearch|ToolSearch|NotebookRead)$|read|get|list|search|find|fetch|query|screenshot|view/i
const WRITES = /^(Edit|Write|MultiEdit|NotebookEdit)$/
const ASKS = /^(AskUserQuestion|ExitPlanMode)$/

const moodFor = (tool: string): Mood => {
  if (ASKS.test(tool)) {
    return 'asking'
  }

  if (WRITES.test(tool)) {
    return 'writing'
  }

  if (READS.test(tool)) {
    return 'reading'
  }

  return 'running'
}

// What a screen reader hears for each mood.
const STATES: Record<Mood, string> = {
  idle: 'keeping still',
  listening: 'hearing you',
  thinking: 'thinking',
  reading: 'reading',
  writing: 'writing',
  running: 'running a command',
  asking: 'waiting for you',
  oops: 'struck by a glitch',
  done: 'finished',
  sleepy: 'dormant',
}

// For a terminal, which draws no pictures.
const FACES: Record<Mood, string> = {
  idle: '‹ ∴ ›',
  listening: '‹ ! ›',
  thinking: '‹ … ›',
  reading: '‹ ≡ ›',
  writing: '‹ _ ›',
  running: '‹ » ›',
  asking: '‹ ? ›',
  oops: '‹ ╳ ›',
  done: '‹ ○ ›',
  sleepy: '‹ · ›',
}

// These start over on a reload; the mood itself lives in `$.state`.
let isWorking = false
let inFlight = 0
let pending: Timer | undefined

const show = ($: EngineInterface, next: Mood) => update($, mood, () => next)

/** Replaces whatever change was waiting with this one. */
const later = ($: EngineInterface, ms: number, change: () => Mood | undefined) => {
  pending?.cancel()
  pending = $.clock.after(ms, () => {
    const next = change()

    if (next !== undefined) {
      void show($, next)
    }
  })
}

/** Shows a mood, then drifts back to idle, and goes dormant if nothing happens. */
const rest = async ($: EngineInterface, first: Mood, forMs: number) => {
  await show($, first)
  later($, forMs, () => {
    later($, DORMANT_AFTER, () => (isWorking ? undefined : 'sleepy'))

    return isWorking ? undefined : 'idle'
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'angel',
      description: 'The wired angel: /angel hide, show, big or small',
    })
    const savedSize = await $.store.get('size')
    const savedHidden = await $.store.get('isHidden')

    if (savedSize === 'small' || savedSize === 'big') {
      await update($, size, () => savedSize)
    }

    if (typeof savedHidden === 'boolean') {
      await update($, isHidden, () => savedHidden)
    }
    await rest($, 'idle', 0)

    return next(e)
  })

  on('command.run', { command: 'angel' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()

    if (word === 'big' || word === 'small') {
      const picked: Size = word
      await update($, size, () => picked)
      await update($, isHidden, () => false)
      await $.store.set('size', picked)
      await $.store.set('isHidden', false)

      return { text: `the angel is ${picked} now.` }
    }

    if (word !== '' && word !== 'hide' && word !== 'show') {
      return { text: 'Try /angel hide, /angel show, /angel big or /angel small.' }
    }
    const hide = word === 'hide' || (word === '' && !(await read($, isHidden)))
    await update($, isHidden, () => hide)
    await $.store.set('isHidden', hide)

    return { text: hide ? 'signal withdrawn. /angel show calls it back.' : 'signal restored.' }
  })

  on('prompt.submit', async ($, e, next) => {
    pending?.cancel()
    await show($, 'listening')

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // A helper's own turn: the tools it runs still show, its start and end don't.
    if (e.agentId !== undefined) {
      return next(e)
    }
    isWorking = true
    inFlight = 0
    later($, HEARD, () => (isWorking && inFlight === 0 ? 'thinking' : undefined))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    inFlight += 1
    pending?.cancel()
    await show($, moodFor(String(e.tool)))
    const ran = await next(e)
    inFlight = Math.max(0, inFlight - 1)
    const hasSnag = ran.deny !== undefined || ran.isError === true

    if (hasSnag) {
      await show($, 'oops')
    }

    if (inFlight === 0) {
      later($, hasSnag ? SNAG : TOOL_LINGER, () =>
        isWorking && inFlight === 0 ? 'thinking' : undefined,
      )
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    isWorking = false
    inFlight = 0

    if (e.reason === 'answer') {
      await rest($, 'done', STEADY)
    } else if (e.reason === 'aborted') {
      await rest($, 'idle', 0)
    } else {
      await rest($, 'oops', STEADY)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }
    const felt = await read($, mood)
    // The band knows whether a turn is running, so a stale mood never shows:
    // no busy pose while idle, and no dormancy in the middle of work.
    const isBusy = BUSY.includes(felt)
    const now: Mood = e.props.isWorking
      ? isBusy || felt === 'oops'
        ? felt
        : 'thinking'
      : isBusy
        ? 'idle'
        : felt

    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      const { Text } = $.ui.resolve(e)

      return (
        <Text dimColor>
          {FACES[now]} {PET_WORDS[now]}
        </Text>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    const scale = (await read($, size)) === 'small' ? 2 : 3

    return (
      <Box flexDirection="row" alignItems="flex-end" gap={1}>
        <Svg
          source={PET_ART[now]}
          alt={`A veiled angel of static with sigil wings, ${STATES[now]}`}
          width={PET_SIZE.width * scale}
          height={PET_SIZE.height * scale}
        />
        <Text dimColor>{PET_WORDS[now]}</Text>
      </Box>
    )
  })
}
