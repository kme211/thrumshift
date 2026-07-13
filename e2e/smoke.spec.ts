import { expect, test } from '@playwright/test'

test('shows the pre-mission flow without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Thrumshift')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reactor Cooling Failure' }),
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
})

test('removes nonessential transition time when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')

  const productRegion = page.getByRole('region', {
    name: 'Reactor Cooling Failure',
  })
  const normalTransitionDuration = await productRegion.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  )

  expect(normalTransitionDuration).toBeGreaterThan(0)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedTransitionDuration = await productRegion.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  )

  expect(reducedTransitionDuration).toBeLessThanOrEqual(0.00001)
})
