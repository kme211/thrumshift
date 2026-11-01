import { expect, test } from '@playwright/test'

async function assertNoHorizontalOverflow(
  page: import('@playwright/test').Page,
) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
}

async function enterActiveMission(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Run Simulation' }).click()
  await page.getByRole('button', { name: 'Connect simulator' }).click()
  const cadence = page.getByLabel('Sample cadence (ms)')
  await cadence.fill('250')
  await page.getByRole('button', { name: /^(Start|Restart) Samples$/ }).click()
  await page.getByRole('button', { name: 'Begin Warm-Up' }).click()
  await expect(page.getByText('Active mission')).toBeVisible({
    timeout: 20_000,
  })
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reactor Cooling Failure' }),
  ).toBeVisible()
}

async function assertControlsInsideViewport(
  page: import('@playwright/test').Page,
) {
  const controls = page
    .getByRole('region', { name: 'Coolant deduction puzzle' })
    .locator('select, button')
  const bounds = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        viewport: document.documentElement.clientWidth,
      }
    }),
  )
  expect(bounds).toHaveLength(6)
  for (const control of bounds) {
    expect(control.left).toBeGreaterThanOrEqual(0)
    expect(control.right).toBeLessThanOrEqual(control.viewport)
    expect(control.width).toBeGreaterThanOrEqual(44)
    expect(control.height).toBeGreaterThanOrEqual(44)
  }
}

async function changeValveWithVisibleFocus(
  page: import('@playwright/test').Page,
) {
  const control = page.getByLabel('V1 position')
  await control.focus()
  await control.press('Space')
  await control.press('b')
  await control.press('Enter')
  await expect(control).toHaveValue('B')
  await expect(control).toBeFocused()
  const focus = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      left: rect.left,
      right: rect.right,
      viewport: document.documentElement.clientWidth,
      outlineStyle: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      offset: Number.parseFloat(style.outlineOffset),
    }
  })
  const extent = focus.width + focus.offset
  expect(focus.outlineStyle).not.toBe('none')
  expect(focus.width).toBeGreaterThan(0)
  expect(focus.left).toBeGreaterThanOrEqual(extent)
  expect(focus.right + extent).toBeLessThanOrEqual(focus.viewport)
}

test('simulator presets feed the normal active-mission telemetry path', async ({
  page,
}) => {
  await enterActiveMission(page)
  const inRange = page.getByRole('button', { name: 'In range 110 BPM' })
  const high = page.getByRole('button', { name: 'High 160 BPM' })
  await expect(inRange).toHaveAttribute('aria-pressed', 'true')
  await high.click()
  await expect(page.getByLabel('Current simulated heart rate')).toHaveText(
    /160\s+BPM/,
  )
  await expect(high).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page
      .getByRole('region', { name: 'Current heart rate' })
      .getByText(/Above range/),
  ).toBeVisible({ timeout: 5_000 })
})

for (const viewport of [
  { name: 'narrow phone portrait', width: 360, height: 640 },
  { name: 'reference phone', width: 390, height: 844 },
  { name: 'larger phone or tablet', width: 768, height: 1024 },
]) {
  test(`deduction controls fit ${viewport.name} without overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await enterActiveMission(page)
    await assertNoHorizontalOverflow(page)
    await assertControlsInsideViewport(page)
    await expect(
      page.getByRole('list', { name: 'Experiment history' }),
    ).toContainText('INITIAL')
    await changeValveWithVisibleFocus(page)
  })
}

test('viewport orientation changes preserve positions, knowledge, expenditure and experiment history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await enterActiveMission(page)
  await page.getByLabel('V1 position').selectOption('B')
  await page.getByLabel('Trace target').selectOption('C')
  await expect(page.getByText('Trace charges: 2/2')).toBeVisible()
  await expect(page.getByText('No fittings traced.')).toBeVisible()
  await page
    .getByRole('button', { name: 'Junction Trace', exact: true })
    .click()
  await expect(page.getByText('Fitting C: V3.u → V2.x')).toBeVisible()
  const history = await page
    .getByRole('list', { name: 'Experiment history' })
    .textContent()
  await page.setViewportSize({ width: 640, height: 360 })
  await expect(page.getByLabel('V1 position')).toHaveValue('B')
  await expect(page.getByText('Fitting C: V3.u → V2.x')).toBeVisible()
  await expect(page.getByText('Trace charges: 1/2')).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Experiment history' }),
  ).toHaveText(history!)
  await assertNoHorizontalOverflow(page)
  await assertControlsInsideViewport(page)
})

test('reduced motion preserves immediate valve experiments and removes nonessential transition motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await enterActiveMission(page)
  await changeValveWithVisibleFocus(page)
  await expect(page.getByText('Experiment history (2)')).toBeVisible()
  const motion = await page
    .locator('.coolant-deduction select, .mission-flow-stage')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element)
        return {
          animation: style.animationName,
          transition: Number.parseFloat(style.transitionDuration),
        }
      }),
    )
  for (const style of motion) {
    expect(style.animation).toBe('none')
    expect(style.transition).toBeLessThanOrEqual(0.00001)
  }
})

for (const viewport of [
  { name: '200 percent page zoom', width: 768, height: 1024, zoom: 2 },
  { name: '180px ultra-narrow reflow', width: 180, height: 900, zoom: 1 },
]) {
  test(`remains operable at ${viewport.name} without control or focus clipping`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await enterActiveMission(page)
    await page.evaluate((zoom) => {
      document.documentElement.style.zoom = String(zoom)
    }, viewport.zoom)
    await assertNoHorizontalOverflow(page)
    await assertControlsInsideViewport(page)
    await changeValveWithVisibleFocus(page)
    await page.getByLabel('Trace target').selectOption('A')
    await page
      .getByRole('button', { name: 'Junction Trace', exact: true })
      .click()
    await expect(page.getByText('Fitting A: V1.A → V2.q')).toBeVisible()
    await page.getByRole('button', { name: 'Reset routing' }).click()
    await expect(page.getByLabel('V1 position')).toHaveValue('A')
    await expect(page.getByText('Trace charges: 1/2')).toBeVisible()
    await expect(page.getByText('Experiment history (3)')).toBeVisible()
    const history = page.getByRole('list', { name: 'Experiment history' })
    await history.focus()
    await expect(history).toBeFocused()
    await expect(history).toContainText('ROUTING RESET')
    await expect(
      page.getByRole('button', { name: 'Pause mission' }),
    ).toBeVisible()
  })
}

test('forced colors preserves textual flow, discoveries, disabled states and keyboard focus', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await enterActiveMission(page)
  const readings = page.getByRole('group', { name: 'Flow readings' })
  await expect(readings.getByText('S: FLOW', { exact: true })).toBeVisible()
  await expect(
    readings.getByText('reactor: NO FLOW', { exact: true }),
  ).toBeVisible()
  await changeValveWithVisibleFocus(page)
  await page
    .getByRole('button', { name: 'Junction Trace', exact: true })
    .click()
  await expect(page.getByText('Fitting A: V1.A → V2.q')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Junction Trace', exact: true }),
  ).toBeDisabled()
  await expect(page.getByLabel('V1 position')).toHaveValue('B')
})

test('manual pause freezes controls and restores logical keyboard focus', async ({
  page,
}) => {
  await enterActiveMission(page)
  const tile = page.getByLabel('V1 position')
  await tile.selectOption('B')
  await page.getByLabel('Trace target').selectOption('C')
  await page
    .getByRole('button', { name: 'Junction Trace', exact: true })
    .click()
  const historyBefore = await page
    .getByRole('list', { name: 'Experiment history' })
    .textContent()
  const before = await tile.inputValue()
  await page.getByRole('button', { name: 'Pause mission' }).click()
  const resume = page.getByRole('button', { name: 'Resume mission' })
  await expect(resume).toBeFocused()
  await expect(resume).toHaveAttribute('aria-disabled', 'true')
  await expect(tile).toBeDisabled()
  await resume.press('Shift+Tab')
  expect(
    await page
      .getByRole('dialog', { name: 'Mission paused' })
      .evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true)
  await page.keyboard.press('Tab')
  expect(
    await page
      .getByRole('dialog', { name: 'Mission paused' })
      .evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true)
  await expect(resume).toHaveAttribute('aria-disabled', 'false', {
    timeout: 5_000,
  })
  await resume.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Pause mission' }),
  ).toBeFocused()
  await expect(tile).toHaveValue(before)
  await expect(page.getByText('Fitting C: V3.u → V2.x')).toBeVisible()
  await expect(page.getByText('Trace charges: 1/2')).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Experiment history' }),
  ).toHaveText(historyBefore!)
})

test('stale signal pauses exactly once, retains the puzzle, and requires explicit resume', async ({
  page,
}) => {
  await enterActiveMission(page)
  const tile = page.getByLabel('V1 position')
  await tile.selectOption('B')
  await page
    .getByRole('button', { name: 'Junction Trace', exact: true })
    .click()
  const retainedOrientation = await tile.inputValue()
  await page.getByRole('button', { name: 'Stop Samples' }).click()

  await expect(
    page.getByRole('dialog', { name: 'Mission paused' }),
  ).toBeVisible({ timeout: 5_000 })
  await expect(
    page.getByText('No fresh heart-rate signal is available.'),
  ).toBeVisible()
  const diagnostics = page.getByRole('complementary', {
    name: 'Development diagnostics',
  })
  const missionValues = diagnostics.locator('dl')
  const exactAttributes = [
    'data-mission-active-elapsed-ms',
    'data-mission-duration-below-range-ms',
    'data-mission-duration-operational-ms',
    'data-mission-duration-above-range-ms',
    'data-mission-valve-adjustments',
    'data-mission-traces-spent',
    'data-mission-observation-count',
    'data-mission-discovery-count',
    'data-mission-stability',
  ] as const
  const frozenValues = Object.fromEntries(
    await Promise.all(
      exactAttributes.map(async (attribute) => [
        attribute,
        await missionValues.getAttribute(attribute),
      ]),
    ),
  )
  for (const attribute of exactAttributes)
    expect(frozenValues[attribute]).not.toBeNull()

  await page
    .getByRole('button', { name: 'Disconnect simulator' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(
    page.getByRole('button', { name: 'Reconnect monitor' }),
  ).toBeVisible()
  await expect(diagnostics).toHaveAttribute(
    'data-telemetry-status',
    'disconnected',
  )
  await expect(
    page.getByText('The heart-rate monitor disconnected.'),
  ).toBeVisible()
  for (const attribute of exactAttributes) {
    await expect(missionValues).toHaveAttribute(
      attribute,
      frozenValues[attribute]!,
    )
  }
  await expect(tile).toHaveValue(retainedOrientation)
  await expect(
    page.getByRole('button', { name: 'Resume mission' }),
  ).toHaveAttribute('aria-disabled', 'true')
})

test('disconnect recovery uses a direct reconnect gesture and preserves explicit resume', async ({
  page,
}) => {
  await enterActiveMission(page)
  await page.getByRole('button', { name: 'Disconnect simulator' }).click()
  const reconnect = page.getByRole('button', { name: 'Reconnect monitor' })
  await expect(reconnect).toBeFocused()
  await reconnect.click()
  const resume = page.getByRole('button', { name: 'Resume mission' })
  await expect(resume).toHaveAttribute('aria-disabled', 'true')
  await page
    .getByRole('button', { name: 'Start Samples' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(resume).toHaveAttribute('aria-disabled', 'false', {
    timeout: 5_000,
  })
  await resume.click()
  await expect(
    page.getByRole('button', { name: 'Pause mission' }),
  ).toBeFocused()
})

test('hidden and disconnected blockers clear independently', async ({
  page,
}) => {
  await enterActiveMission(page)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page
    .getByRole('button', { name: 'Disconnect simulator' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(
    page.getByText('The heart-rate monitor disconnected.'),
  ).toBeVisible()
  await expect(
    page.getByText('The page was hidden. Mission time stopped immediately.'),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Reconnect monitor' }).click()
  const resume = page.getByRole('button', { name: 'Resume mission' })
  await expect(resume).toHaveAttribute('aria-disabled', 'true')
})
