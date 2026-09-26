import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { basename, dirname, join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from './fixtures/electron-app'

test('packaged Mobius Science starts, saves research, and relaunches', async ({
  app
}, testInfo) => {
  test.skip(!process.env.OPEN_SCIENCE_E2E_EXECUTABLE, 'Requires the packaged application')

  await app.page.evaluate(() => window.api.locale.setPreference({ preference: 'en' }))
  const brand = await app.captureBrandState()
  expect(brand.packaged).toBe(true)
  expect(brand.name).toBe('Mobius Science')
  expect(brand.title).toContain('Mobius Science')
  expect(brand.windowTitles).not.toContain('Open-Science')

  const storage = await app.page.evaluate(() => window.api.storage.getInfo())
  expect(basename(storage.dataRoot)).toBe('MobiusScience')
  await access(join(dirname(storage.dataRoot), 'mobius-science.db'))

  let page = await app.completeOnboarding()
  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByLabel('Name').fill('Release smoke research')
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'New conversation' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mobius-release-project.png') })

  page = await app.restart()
  await expect(
    page
      .getByRole('region', { name: 'Projects' })
      .getByRole('button', { name: 'Release smoke research', exact: true })
  ).toBeVisible()
  expect((await app.captureBrandState()).name).toBe('Mobius Science')
})

test('packaged application migrates a legacy database and preserves conversation and file bytes', async ({
  app
}, testInfo) => {
  test.skip(!process.env.OPEN_SCIENCE_E2E_EXECUTABLE, 'Requires the packaged application')
  await app.page.evaluate(() => window.api.locale.setPreference({ preference: 'en' }))
  await app.completeOnboarding()
  let page = await app.configureFakeAgent()
  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByLabel('Name').fill('Retained legacy research')
  await dialog.getByRole('button', { name: 'Create project' }).click()
  const prompt = 'Summarize the deterministic fixture.'
  await page.getByRole('textbox', { name: 'Ask anything' }).fill(prompt)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText(`Deterministic reply: ${prompt}`, { exact: false })).toBeVisible()
  const before = await page.evaluate(() => window.api.sessions.loadAll())
  const storage = await page.evaluate(() => window.api.storage.getInfo())
  const databasePath = join(dirname(storage.dataRoot), 'mobius-science.db')
  const readProjects = (): unknown[] => {
    const database = new DatabaseSync(databasePath, { readOnly: true })
    try {
      return database.prepare('SELECT * FROM Project ORDER BY id').all()
    } finally {
      database.close()
    }
  }
  const projectsBefore = readProjects()
  expect(JSON.stringify(projectsBefore)).toContain('Retained legacy research')
  const marker = join(storage.dataRoot, 'release-research-evidence.txt')
  await writeFile(marker, '研究数据保持原样 — retained evidence\n')
  page = await app.restartWithBrandFixture('legacy-database')
  const after = await page.evaluate(() => window.api.sessions.loadAll())
  expect(after.sessions.map((s) => s.id)).toEqual(before.sessions.map((s) => s.id))
  expect(readProjects()).toEqual(projectsBefore)
  expect(JSON.stringify(after.sessions)).toContain(`Deterministic reply: ${prompt}`)
  expect(await readFile(marker, 'utf8')).toBe('研究数据保持原样 — retained evidence\n')
  await access(join(dirname(storage.dataRoot), 'mobius-science.db'))
  await expect(access(join(dirname(storage.dataRoot), 'open-science.db'))).rejects.toThrow()
  await page.screenshot({ path: testInfo.outputPath('legacy-upgrade-retained.png') })
  page = await app.restart()
  expect(readProjects()).toEqual(projectsBefore)
  expect(
    JSON.stringify((await page.evaluate(() => window.api.sessions.loadAll())).sessions)
  ).toContain(`Deterministic reply: ${prompt}`)
})

// No application fixture: this case must stop before a browser window exists.
// eslint-disable-next-line no-empty-pattern
test('packaged startup refuses conflicting databases without changing either copy', async ({}, testInfo) => {
  const executable = process.env.OPEN_SCIENCE_E2E_EXECUTABLE
  test.skip(!executable, 'Requires the packaged application')
  const root = await mkdtemp(join(tmpdir(), 'mobius-release-conflict-'))
  const config = join(root, 'config')
  await mkdir(config)
  try {
    const snapshots = new Map<string, Buffer>()
    for (const name of ['mobius-science.db', 'open-science.db']) {
      const path = join(config, name)
      const database = new DatabaseSync(path)
      database.exec('CREATE TABLE retained_research (note TEXT NOT NULL)')
      database.prepare('INSERT INTO retained_research VALUES (?)').run(name)
      database.close()
      snapshots.set(path, await readFile(path))
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OPEN_SCIENCE_CONFIG_ROOT: config,
      OPEN_SCIENCE_STORAGE_ROOT: config,
      OPEN_SCIENCE_USER_DATA: join(root, 'electron-profile')
    }
    delete env.ELECTRON_RUN_AS_NODE
    let failure: (Error & { code?: number; stderr?: string }) | undefined
    try {
      await promisify(execFile)(
        executable!,
        [
          '--open-science-headless',
          '--use-mock-keychain',
          `--user-data-dir=${join(root, 'electron-profile')}`
        ],
        { env, timeout: 30_000 }
      )
    } catch (error) {
      failure = error as typeof failure
    }
    expect(failure?.code).toBe(1)
    expect(failure?.stderr).toContain('PROJECT_DATABASE: conflicting-files')
    for (const [path, bytes] of snapshots) expect(await readFile(path)).toEqual(bytes)
    await testInfo.attach('conflict-recovery-message', {
      body: failure!.stderr!,
      contentType: 'text/plain'
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
