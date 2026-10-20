import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, lastStepWasSilent, DEFAULT_EVERY_STEPS, DEFAULT_REMINDER } from './index.mjs'

const silentMessage = {
  type: 'assistant/message',
  data: { message: { content: [{ type: 'reasoning' }, { type: 'tool-call' }] } },
}

const narratedMessage = {
  type: 'assistant/message',
  data: {
    message: {
      content: [{ type: 'reasoning' }, { type: 'text', text: '先说明一下进展。' }, { type: 'tool-call' }],
    },
  },
}

const userMessage = { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: 'go' }] } }

function makeSession(events) {
  return {
    surface: { nodes: events.map((_, index) => index) },
    eventAt(index) {
      return events[index]
    },
  }
}

function makeAgent(events) {
  return { session: makeSession(events) }
}

function install(config) {
  const sections = []
  const handlers = {}
  const ctx = {
    effect(run) {
      return run()
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
        return () => {}
      },
    },
    on(name, handler) {
      handlers[name] = handler
    },
  }
  apply(ctx, config)
  return { sections, handlers }
}

async function preStep(handlers, agent, step) {
  const decision = await handlers['agent/pre-step'](
    { agent, step, signal: { aborted: false } },
    async () => ({ kind: 'enter', messages: [] }),
  )
  return decision.messages.length
}

test('registers the configured system-prompt section', () => {
  const { sections } = install({ text: 'RULES', order: 4242, name: 'user:test-rules' })
  assert.deepEqual(sections, [{ name: 'user:test-rules', order: 4242, text: 'RULES' }])
})

test('drops an empty section', () => {
  const { sections } = install({ text: '   ' })
  assert.equal(sections.length, 0)
})

test('detects silent assistant messages', () => {
  assert.equal(lastStepWasSilent(makeAgent([silentMessage])), true)
  assert.equal(lastStepWasSilent(makeAgent([narratedMessage])), false)
  assert.equal(lastStepWasSilent(makeAgent([userMessage, silentMessage])), true)
  assert.equal(lastStepWasSilent(makeAgent([silentMessage, userMessage])), false)
  assert.equal(lastStepWasSilent(makeAgent([])), false)
  assert.equal(lastStepWasSilent(makeAgent([{ type: 'assistant/message', data: { message: { content: [] } } }])), true)
})

test('reminds only after everySteps consecutive silent steps', async () => {
  const { handlers } = install({ text: 'RULES' })
  const agent = makeAgent([silentMessage])
  const injected = []
  for (let step = 1; step <= 12; step += 1) injected.push(await preStep(handlers, agent, step))
  assert.deepEqual(injected, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0])
})

test('a narrated step resets the silent counter', async () => {
  const { handlers } = install({ text: 'RULES', everySteps: 3 })
  const events = [silentMessage]
  const agent = makeAgent(events)
  const injected = []
  for (let step = 1; step <= 9; step += 1) {
    // Narration arrives at the assistant message preceding step 3, so the
    // counter restarts there: steps 4/5/6 are silent and trigger at step 6;
    // steps 7/8/9 are silent again and trigger at step 9.
    events[0] = step === 3 ? narratedMessage : silentMessage
    injected.push(await preStep(handlers, agent, step))
  }
  assert.deepEqual(injected, [0, 0, 0, 0, 0, 1, 0, 0, 1])
})

test('step 1 never injects and resets the counter', async () => {
  const { handlers } = install({ text: 'RULES', everySteps: 2 })
  const agent = makeAgent([silentMessage])
  assert.equal(await preStep(handlers, agent, 2), 0)
  assert.equal(await preStep(handlers, agent, 1), 0)
  assert.equal(await preStep(handlers, agent, 2), 0)
  assert.equal(await preStep(handlers, agent, 3), 1)
})

test('injected reminder is a user-role context message', async () => {
  const { handlers } = install({ text: 'RULES', everySteps: 1 })
  const agent = makeAgent([silentMessage])
  const decision = await handlers['agent/pre-step'](
    { agent, step: 2, signal: { aborted: false } },
    async () => ({ kind: 'enter', messages: [{ id: 'claimed' }] }),
  )
  assert.equal(decision.messages.length, 2)
  const reminder = decision.messages[1]
  assert.equal(reminder.role, 'user')
  assert.equal(reminder.content[0].text, DEFAULT_REMINDER)
  assert.equal(reminder.source.kind, 'progress-rules')
})

test('enforce:false disables the nudge but keeps the prompt section', () => {
  const { sections, handlers } = install({ text: 'RULES', enforce: false })
  assert.equal(sections.length, 1)
  assert.equal(handlers['agent/pre-step'], undefined)
})

test('everySteps defaults to the documented 5', () => {
  assert.equal(DEFAULT_EVERY_STEPS, 5)
})
