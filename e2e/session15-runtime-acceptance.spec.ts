import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from './fixtures/electron-app'
import { createProject, openRecentSession, sendPrompt } from './certification/helpers'

test.use({ windowMode: 'normal' })

test('delivers the Chinese-progress contract to new and resumed OpenCode Notebook turns', async ({
  app
}, testInfo) => {
  test.setTimeout(120_000)
  await app.completeOnboarding()
  let page = await app.configureFakeAgent()
  await createProject(page, 'Session 15 presentation acceptance')
  const firstPrompt =
    '请用中文完整说明 Notebook 运行前后的进度，最终报告使用英文。Verify the notebook lifecycle.'
  await sendPrompt(page, firstPrompt, 'Notebook lifecycle verified for')

  page = await app.restart()
  await openRecentSession(page, '请用中文完整说明 Notebook')
  await expect(page.getByText('Notebook lifecycle verified for', { exact: false })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Ask anything' })).toBeEnabled()
  const secondPrompt =
    '继续用中文完整汇报 Notebook 执行进度，报告仍为英文。Verify the notebook lifecycle.'
  await sendPrompt(page, secondPrompt, 'Notebook lifecycle verified for')

  const testRoot = dirname(await app.createTestDirectory('session15-capture'))
  const capturePath = join(testRoot, 'storage', 'e2e-handoff-captures', 'provider-prompts.jsonl')
  await expect
    .poll(async () => {
      const raw = await readFile(capturePath, 'utf8')
      return raw
        .split('\n')
        .filter(Boolean)
        .some((line) => JSON.parse(line).prompt.includes(secondPrompt))
    })
    .toBe(true)
  const raw = await readFile(capturePath, 'utf8')
  const prompts = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { prompt: string })
  for (const userText of [firstPrompt, secondPrompt]) {
    const captured = prompts.find(({ prompt }) => prompt.includes(userText))
    expect(captured, `missing captured prompt for ${userText}`).toBeDefined()
    expect(captured!.prompt.match(/<mobius_turn_presentation>/gu)).toHaveLength(1)
    expect(captured!.prompt).toContain('Your product identity is Mobius Science Agent')
    expect(captured!.prompt).toContain("latest user's conversational language")
    expect(captured!.prompt).toContain('complete natural sentences')
  }
  await page.screenshot({ path: testInfo.outputPath('notebook-turns.png'), fullPage: true })
})

test('keeps every streamed chunk across a tool boundary in the Electron conversation', async ({
  app
}, testInfo) => {
  test.setTimeout(120_000)
  await app.completeOnboarding()
  const page = await app.configureFakeAgent()
  await createProject(page, 'Session 15 stream acceptance')
  await sendPrompt(
    page,
    'Run the ordered slow tool journey.',
    'The slow tool has finished running.'
  )
  const conversation = page.getByRole('region', { name: 'Conversation' })
  await expect(conversation.getByText('Intent paragraph 29', { exact: false })).toBeVisible()
  const rendered = await conversation.innerText()
  for (let index = 0; index < 30; index += 1) {
    const marker = `Intent paragraph ${index}:`
    expect(rendered.split(marker).length - 1, marker).toBe(1)
  }
  await page.screenshot({ path: testInfo.outputPath('complete-stream.png'), fullPage: true })
})
