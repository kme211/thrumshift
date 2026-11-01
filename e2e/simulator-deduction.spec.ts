import { expect, test } from '@playwright/test'

test('production simulation supports tracing, routing reset, completion and a fresh replay', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: () => {
          throw new Error('Simulator must never request a Bluetooth chooser')
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Run Simulation' }).click()
  await page.getByRole('button', { name: 'Begin Warm-Up' }).click()
  await expect(
    page.getByRole('heading', { name: 'Warm-up', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Mission countdown', exact: true }),
  ).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Active mission', { exact: true })).toBeVisible({
    timeout: 10_000,
  })
  await expect(
    page.getByRole('heading', { name: 'Development diagnostics' }),
  ).toHaveCount(0)
  await expect(page.getByText('Development telemetry source')).toHaveCount(0)

  await page.getByLabel('Trace target').selectOption('C')
  await expect(
    page.getByText('Reveal fitting C and its direction. Cost: 1 trace charge.'),
  ).toBeVisible()
  await expect(page.getByText('No fittings traced.')).toBeVisible()
  await expect(page.getByText('Trace charges: 2/2')).toBeVisible()
  await page
    .getByRole('button', { name: 'Junction Trace', exact: true })
    .click()
  await expect(page.getByText('Fitting C: V3.u → V2.x')).toBeVisible()
  await expect(page.getByText('Trace charges: 1/2')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Junction Trace', exact: true }),
  ).toBeDisabled()
  // Allow the normal stream to establish sufficient in-mission sample coverage for the rating.
  await page.waitForTimeout(5_000)
  await page.getByLabel('V1 position').selectOption('B')
  await page.getByRole('button', { name: 'Reset routing' }).click()
  await expect(page.getByLabel('V1 position')).toHaveValue('A')
  await expect(page.getByText('Fitting C: V3.u → V2.x')).toBeVisible()
  await expect(page.getByText('Trace charges: 1/2')).toBeVisible()
  await expect(page.getByText('Experiment history (3)')).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Experiment history' }),
  ).toContainText('ROUTING RESET')

  await page.getByLabel('V1 position').selectOption('B')
  await page.getByLabel('V2 position').selectOption('II')
  await page.getByLabel('V3 position').selectOption('v')
  await expect(
    page.getByRole('heading', { name: 'SYSTEM RESTORED', exact: true }),
  ).toBeFocused()
  await expect(page.getByText('4 adjustments')).toBeVisible()
  await expect(page.getByText('1 trace')).toBeVisible()
  await expect(
    page.getByText('Controlled Finish', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Run Again' }).click()
  await expect(
    page.getByRole('heading', { name: 'Reactor Cooling Failure', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Begin Warm-Up' }).click()
  await expect(page.getByText('Active mission', { exact: true })).toBeVisible({
    timeout: 25_000,
  })
  await expect(page.getByLabel('V1 position')).toHaveValue('A')
  await expect(page.getByLabel('V2 position')).toHaveValue('I')
  await expect(page.getByLabel('V3 position')).toHaveValue('u')
  await expect(page.getByText('Trace charges: 2/2')).toBeVisible()
  await expect(page.getByText('No fittings traced.')).toBeVisible()
  await expect(page.getByText('Experiment history (1)')).toBeVisible()
  await expect(
    page.getByText('Valve adjustments: 0 · Junction Traces spent: 0'),
  ).toBeVisible()
})
