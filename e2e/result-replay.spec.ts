import { expect, test, type Page } from '@playwright/test'

async function setTestTime(page: Page, time: number) {
  await page.evaluate((nextTime) => {
    ;(
      window as Window & { __thrumshiftTestTime: number }
    ).__thrumshiftTestTime = nextTime
  }, time)
}

async function openWithDeterministicClock(page: Page) {
  await page.addInitScript(() => {
    const controlledWindow = window as Window & {
      __thrumshiftTestTime: number
    }
    controlledWindow.__thrumshiftTestTime = 0
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => controlledWindow.__thrumshiftTestTime,
    })
  })
  await page.goto('/')
}

async function emitSample(page: Page, time: number, bpm?: number) {
  await setTestTime(page, time)
  if (bpm !== undefined) {
    await page.getByLabel('Simulated BPM').fill(String(bpm))
  }
  await page.getByRole('button', { name: 'Emit simulated sample' }).click()
}

async function enterMission(page: Page, origin = 0) {
  if (origin === 0) {
    await openWithDeterministicClock(page)
    await page.getByRole('button', { name: 'Run Simulation' }).click()
    await page.getByRole('button', { name: 'Stop Samples' }).click()
  }
  await setTestTime(page, origin)
  await page.getByRole('button', { name: 'Begin Warm-Up' }).click()
  for (const offset of [
    0, 500, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000,
    10_000, 11_000, 12_000, 13_000, 14_000, 15_000,
  ]) {
    await emitSample(page, origin + offset, 110)
  }
  await setTestTime(page, origin + 16_000)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reactor Cooling Failure' }),
  ).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('Active mission')).toBeVisible()
}

async function solvePuzzle(page: Page, origin: number) {
  for (const [offset, name] of [
    [100, /Row 1, column 2, straight pipe/],
    [200, /Row 2, column 1, corner pipe/],
    [300, /Row 3, column 2, straight pipe/],
  ] as const) {
    await setTestTime(page, origin + offset)
    await page.getByRole('button', { name }).click()
  }
}

async function finishRepresentativeSuccess(page: Page, origin = 0) {
  for (const offset of [17_000, 18_000, 19_000, 20_000, 21_000]) {
    await emitSample(page, origin + offset, 110)
  }
  await solvePuzzle(page, origin + 22_000)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mission successful' }),
  ).toBeFocused()
}

async function finishRepresentativeFailure(page: Page) {
  for (let time = 17_000; time <= 52_000; time += 1_000) {
    await emitSample(page, time, 170)
  }
  await emitSample(page, 54_000, 170)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mission failed' }),
  ).toBeFocused({ timeout: 5_000 })
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
}

test('presents known successful metrics and retains the live source through keyboard replay', async ({
  page,
}) => {
  await enterMission(page)
  await finishRepresentativeSuccess(page)

  await expect(page.getByText('Completion time')).toBeVisible()
  await expect(
    page.getByText('Completion time').locator('..').getByText('0:06'),
  ).toBeVisible()
  await expect(page.getByText('Average heart rate')).toBeVisible()
  await expect(page.getByText('110 BPM', { exact: true })).toHaveCount(2)
  await expect(
    page
      .getByText('Active classified time', { exact: true })
      .locator('..')
      .getByText('0:06'),
  ).toBeVisible()
  await expect(
    page
      .getByText('Below range', { exact: true })
      .locator('..')
      .getByText('0%'),
  ).toBeVisible()
  await expect(page.getByText('Operational', { exact: true })).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Time in gameplay range' })
      .getByText('100%', { exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByText('Above range', { exact: true })
      .locator('..')
      .getByText('0%'),
  ).toBeVisible()
  await expect(page.getByText('Low-output events')).toBeVisible()
  await expect(page.getByText('Overload events')).toBeVisible()
  await expect(page.getByText('0 events', { exact: true })).toHaveCount(2)
  await expect(page.getByText('Station stability remaining')).toBeVisible()
  await expect(page.getByText('100 of 100')).toBeVisible()
  await expect(page.getByText('3 moves')).toBeVisible()
  await expect(page.getByText('No hint used')).toBeVisible()
  await expect(
    page.getByText('Controlled Finish', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/requires mission success/)).toBeVisible()
  await expect(page.getByText('Unclassified signal time')).toHaveCount(0)
  await expect(page.getByText('Unusable signal time')).toHaveCount(0)

  const runAgain = page.getByRole('button', { name: 'Run Again' })
  await runAgain.focus()
  await runAgain.press('Enter')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reactor Cooling Failure' }),
  ).toBeFocused()
  await expect(page.getByText('Connection:')).toContainText('connected')
  await expect(
    page.getByRole('button', { name: 'Begin Warm-Up' }),
  ).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Warm-up' })).toHaveCount(0)
})

test('presents known failed metrics and returns to a connected briefing', async ({
  page,
}) => {
  await enterMission(page)
  await finishRepresentativeFailure(page)

  await expect(page.getByText('Mission duration')).toBeVisible()
  await expect(
    page.getByText('Mission duration').locator('..').getByText('0:37'),
  ).toBeVisible()
  await expect(page.getByText('170 BPM', { exact: true })).toHaveCount(2)
  await expect(
    page
      .getByText('Active classified time', { exact: true })
      .locator('..')
      .getByText('0:37'),
  ).toBeVisible()
  for (const [label, value] of [
    ['Below range', '0%'],
    ['Operational', '11%'],
    ['Above range', '89%'],
  ] as const) {
    await expect(
      page.getByText(label, { exact: true }).locator('..').getByText(value),
    ).toBeVisible()
  }
  await expect(
    page
      .getByText('Low-output events', { exact: true })
      .locator('..')
      .getByText('0 events'),
  ).toBeVisible()
  await expect(
    page
      .getByText('Overload events', { exact: true })
      .locator('..')
      .getByText('1 event'),
  ).toBeVisible()
  await expect(page.getByText('Station stability remaining')).toBeVisible()
  await expect(page.getByText('0 of 100')).toBeVisible()
  await expect(page.getByText('0 moves')).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Performance rating' })
      .getByText('Incomplete', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/reactor failed before/)).toBeVisible()

  await page.getByRole('button', { name: 'Run Again' }).click()
  await expect(page.getByText('Connection:')).toContainText('connected')
  await expect(
    page.getByRole('button', { name: 'Begin Warm-Up' }),
  ).toBeEnabled()
})

test('shows sparse signal honestly and resets puzzle, metrics, and warm-up twice', async ({
  page,
}) => {
  await enterMission(page)
  await solvePuzzle(page, 16_000)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mission successful' }),
  ).toBeFocused()
  await expect(
    page.getByText(/usable signal data was insufficient/i),
  ).toBeVisible()
  await expect(page.getByText('Average heart rate')).toHaveCount(0)
  await expect(page.locator('dt', { hasText: /^Operational$/ })).toHaveCount(0)
  await expect(
    page
      .getByRole('region', { name: 'Performance rating' })
      .getByText('Completed', { exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Run Again' }).click()
  await enterMission(page, 100_000)
  const topTile = page.getByRole('button', {
    name: /Row 1, column 2, straight pipe, open north and south/,
  })
  await expect(topTile).toBeVisible()
  const diagnostics = page.getByRole('complementary', {
    name: 'Development diagnostics',
  })
  await expect(diagnostics.locator('dl')).toHaveAttribute(
    'data-mission-active-elapsed-ms',
    '0',
  )
  await solvePuzzle(page, 116_000)
  await expect(page.getByText('3 moves')).toBeVisible()
  await page.getByRole('button', { name: 'Run Again' }).click()
  await expect(page.getByText('Connection:')).toContainText('connected')
  await expect(
    page.getByRole('button', { name: 'Begin Warm-Up' }),
  ).toBeEnabled()
})

test('result remains usable in portrait, landscape, 200% zoom, forced colors, and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await enterMission(page)
  await finishRepresentativeSuccess(page)
  await expectNoHorizontalOverflow(page)

  await page.setViewportSize({ width: 640, height: 360 })
  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('button', { name: 'Run Again' })).toBeVisible()

  await page.setViewportSize({ width: 768, height: 1024 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  await expectNoHorizontalOverflow(page)
  await expect(
    page.getByText('Controlled Finish', { exact: true }),
  ).toBeVisible()

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await expect(page.getByText('Mission result')).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mission successful' }),
  ).toBeVisible()
  expect(
    await page
      .getByRole('region', { name: 'Mission successful' })
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).transitionDuration),
      ),
  ).toBeLessThanOrEqual(0.00001)
})
