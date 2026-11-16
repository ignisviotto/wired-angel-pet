import { expect, mock, test } from 'claude-code/testing'

const band = (isWorking: boolean) =>
  ({
    plugin: 'wired-angel-pet',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking,
      maxRows: 12,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 12 },
      view: {},
    },
  }) as const

test('the angel follows a turn from start to dormancy, on the desktop', async ($, on) => {
  // Nothing sits beneath the plugin: each hook here stands for the engine.
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'angel' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_, e) =>
    String(e.tool) === 'Bash' ? { result: {}, isError: true as const } : { result: {} },
  )

  const state = async (isWorking: boolean) => {
    const ui = await $.ui.mount({ ...band(isWorking), surface: 'desktop' })
    const pet = await ui.find({ type: 'Svg' })
    await ui.unmount()

    return String(pet?.props.alt)
  }

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await state(false)).toContain('keeping still')

  await $.turn.start({ text: 'hello', turnId: 't1' })
  await clock.advance(1000)
  expect(await state(true)).toContain('thinking')

  await $.tool.call({ tool: 'Read', file_path: '/notes.txt' })
  expect(await state(true)).toContain('reading')
  await clock.advance(700)
  expect(await state(true)).toContain('thinking')

  await $.tool.call({ tool: 'Write', file_path: '/notes.txt', content: 'hi' })
  expect(await state(true)).toContain('writing')

  // A tool that reports an error: one hard glitch, then back to thinking. The call itself still returns.
  const ran = await $.tool.call({ tool: 'Bash', command: 'false' })
  expect(ran.isError).toBe(true)
  expect(await state(true)).toContain('glitch')
  await clock.advance(1800)
  expect(await state(true)).toContain('thinking')

  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await state(false)).toContain('finished')
  await clock.advance(7000)
  expect(await state(false)).toContain('keeping still')
  await clock.advance(5 * 60 * 1000)
  expect(await state(false)).toContain('dormant')
})

test('a terminal gets a small text glyph instead of a picture', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'angel' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...band(false), surface: 'terminal' })

  expect((await ui.find({ type: 'Text' }))?.text).toContain('‹ ∴ ›')
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('the angel stays hidden when it was hidden last time', async ($, on) => {
  mock.clock(on)
  mock.store(on, { isHidden: true })
  on('command.register', () => ({ value: { command: 'angel' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...band(false), surface: 'desktop' })

  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
