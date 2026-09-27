import { expect, test } from '@playwright/test'

test('shows the launch console and enters simulation without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Thrumshift')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Stay in range. Keep the station alive.',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Development telemetry diagnostics' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Development diagnostics' }),
  ).toHaveCount(0)

  const productionScripts = await page
    .locator('script[src]')
    .evaluateAll((scripts) =>
      scripts.map((script) => (script as HTMLScriptElement).src),
    )
  for (const scriptUrl of productionScripts) {
    const script = await page.request.get(scriptUrl)
    const source = await script.text()
    expect(source).not.toContain('Development diagnostics')
    expect(source).not.toContain('data-mission-active-elapsed-ms')
    expect(source).not.toContain('data-mission-stability')
    expect(source).not.toContain('Coolant routing workbench')
    expect(source).not.toContain('Start Samples')
    expect(source).not.toContain('Stop Samples')
    expect(source).not.toContain('Begin fake warm-up')
  }

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)

  await page.getByRole('button', { name: 'Run Simulation' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reactor Cooling Failure' }),
  ).toBeVisible()
  await expect(page.getByText('Development telemetry source')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Development diagnostics' }),
  ).toHaveCount(0)
})

test('removes nonessential transition time when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')

  const statusLamp = page.locator('.launch-screen .status-lamp').first()
  const normalTransitionDuration = await statusLamp.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  )

  expect(normalTransitionDuration).toBeGreaterThan(0)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedTransitionDuration = await statusLamp.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  )

  expect(reducedTransitionDuration).toBeLessThanOrEqual(0.00001)
})
