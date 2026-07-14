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

async function assertTilesInsideViewport(
  page: import('@playwright/test').Page,
) {
  const result = await page.locator('.coolant-tile').evaluateAll((tiles) => ({
    viewportWidth: document.documentElement.clientWidth,
    bounds: tiles.map((tile) => {
      const rect = tile.getBoundingClientRect()
      return { left: rect.left, right: rect.right, width: rect.width }
    }),
  }))
  expect(result.bounds).toHaveLength(9)
  for (const bounds of result.bounds) {
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(result.viewportWidth)
    expect(bounds.width).toBeGreaterThanOrEqual(48)
  }
}

async function rotateAndCheckFocusedEdgeTile(
  page: import('@playwright/test').Page,
) {
  const edgeTile = page.locator('.coolant-tile[aria-label^="Row 1, column 1,"]')
  await expect(edgeTile).toHaveCount(1)
  await edgeTile.focus()
  await edgeTile.press('Enter')
  await expect(edgeTile).toBeFocused()
  const focus = await edgeTile.evaluate((tile) => {
    const rect = tile.getBoundingClientRect()
    const style = getComputedStyle(tile)
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: document.documentElement.clientWidth,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset),
    }
  })
  const focusExtent = focus.outlineWidth + focus.outlineOffset
  expect(focus.outlineStyle).not.toBe('none')
  expect(focus.outlineWidth).toBeGreaterThan(0)
  expect(focus.left).toBeGreaterThanOrEqual(focusExtent)
  expect(focus.right + focusExtent).toBeLessThanOrEqual(focus.viewportWidth)
}

for (const viewport of [
  { name: 'narrow phone portrait', width: 360, height: 640 },
  { name: 'larger phone or tablet', width: 768, height: 1024 },
]) {
  test(`puzzle fits ${viewport.name} without overflow`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const board = page.getByRole('group', {
      name: 'Three by three coolant-routing board',
    })
    await expect(board).toBeVisible()
    await assertNoHorizontalOverflow(page)
    const boxes = await board
      .getByRole('button')
      .evaluateAll((tiles) =>
        tiles.map((tile) => tile.getBoundingClientRect().width),
      )
    expect(Math.min(...boxes)).toBeGreaterThan(80)
  })
}

test('viewport orientation changes preserve puzzle state', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/')
  const tile = page.getByRole('button', {
    name: /Row 1, column 2, straight pipe/,
  })
  await tile.click()
  await expect(tile).toHaveAccessibleName(/open east and west/)
  await page.setViewportSize({ width: 640, height: 360 })
  await expect(tile).toHaveAccessibleName(/open east and west/)
  await assertNoHorizontalOverflow(page)
})

test('reduced motion removes tile rotation animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const graphic = page.locator('.coolant-tile__graphic').first()
  expect(
    await graphic.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none')
})

test('remains operable at 200 percent page zoom without board overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/')
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  await expect(
    page.getByRole('group', { name: 'Three by three coolant-routing board' }),
  ).toBeVisible()
  await assertNoHorizontalOverflow(page)
  await assertTilesInsideViewport(page)
  await rotateAndCheckFocusedEdgeTile(page)
  await expect(page.getByRole('button', { name: 'Show hint' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset puzzle' })).toBeVisible()
})

test('reflows below 320 CSS pixels while preserving usable tiles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 180, height: 900 })
  await page.goto('/')
  const board = page.getByRole('group', {
    name: 'Three by three coolant-routing board',
  })
  await expect(board).toBeVisible()
  await assertNoHorizontalOverflow(page)
  const layout = await board.evaluate((element) => ({
    boardWidth: element.getBoundingClientRect().width,
    tileWidths: [...element.querySelectorAll('.coolant-tile')].map(
      (tile) => tile.getBoundingClientRect().width,
    ),
  }))
  expect(layout.boardWidth).toBeLessThanOrEqual(180)
  expect(Math.min(...layout.tileWidths)).toBeGreaterThanOrEqual(48)
  await assertTilesInsideViewport(page)
  await rotateAndCheckFocusedEdgeTile(page)
  await expect(page.getByRole('button', { name: 'Show hint' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset puzzle' })).toBeVisible()
})

test('forced colors preserves a non-color distinction for receiving coolant', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await expect(
    page.getByRole('group', { name: 'Three by three coolant-routing board' }),
  ).toBeVisible()
  const distinction = await page.evaluate(() => {
    const receivingTiles = document.querySelectorAll(
      '.coolant-tile[data-receiving-coolant]',
    )
    const inactiveTiles = document.querySelectorAll(
      '.coolant-tile:not([data-receiving-coolant])',
    )
    const activePatterns = document.querySelectorAll(
      '.coolant-tile[data-receiving-coolant] .coolant-tile__flow-pattern',
    )
    const inactivePatterns = document.querySelectorAll(
      '.coolant-tile:not([data-receiving-coolant]) .coolant-tile__flow-pattern',
    )
    const pattern = activePatterns.item(0)
    const patternStyle = pattern === null ? null : getComputedStyle(pattern)
    return {
      receivingTileCount: receivingTiles.length,
      inactiveTileCount: inactiveTiles.length,
      activePatternCount: activePatterns.length,
      inactivePatternCount: inactivePatterns.length,
      dashArray: patternStyle?.strokeDasharray ?? 'none',
      strokeWidth: Number.parseFloat(patternStyle?.strokeWidth ?? '0'),
    }
  })
  expect(distinction.receivingTileCount).toBeGreaterThan(0)
  expect(distinction.inactiveTileCount).toBeGreaterThan(0)
  expect(distinction.activePatternCount).toBeGreaterThan(0)
  expect(distinction.inactivePatternCount).toBe(0)
  expect(distinction.dashArray).not.toBe('none')
  expect(distinction.strokeWidth).toBeGreaterThan(0)
})
