import { expect, test } from '@playwright/test'

test('serves release metadata and the launch fallback on a direct URL', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: undefined,
    })
  })

  const response = await page.goto('/release-candidate-check')
  expect(response?.ok()).toBe(true)

  await expect(page).toHaveTitle('Thrumshift')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Thrumshift — stay in range and keep the station alive.',
  )
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#10171b',
  )

  const iconLinks = page.locator(
    'link[rel="icon"], link[rel="apple-touch-icon"]',
  )
  await expect(iconLinks).toHaveCount(4)
  for (const href of await iconLinks.evaluateAll((links) =>
    links.map((link) => (link as HTMLLinkElement).href),
  )) {
    const icon = await page.request.get(href)
    expect(icon.ok()).toBe(true)
    expect(icon.headers()['content-type']).toBe('image/png')
  }

  await expect(
    page.getByRole('button', { name: 'Connect Bio-Link' }),
  ).toBeDisabled()
  await expect(
    page.getByText(/Bio-link unavailable in this browser/i),
  ).toBeVisible()

  await page.reload()
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Stay in range. Keep the station alive.',
    }),
  ).toBeVisible()
})

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
