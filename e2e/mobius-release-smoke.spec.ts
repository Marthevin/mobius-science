import { access } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from './fixtures/electron-app'

test('packaged Mobius Science starts, saves research, and relaunches', async ({ app }, testInfo) => {
  test.skip(!process.env.OPEN_SCIENCE_E2E_EXECUTABLE, 'Requires the packaged application')

  await app.page.evaluate(() => window.api.locale.setPreference({ preference: 'en' }))
  const brand = await app.captureBrandState()
  expect(brand.packaged).toBe(true)
  expect(brand.name).toBe('Mobius Science')
  expect(brand.title).toContain('Mobius Science')

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
