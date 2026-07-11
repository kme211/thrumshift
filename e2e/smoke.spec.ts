import { expect, test } from '@playwright/test'

test('shows the Phase 1 entry screen without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Thrumshift')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Thrumshift' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Reactor Cooling Failure' }),
  ).toBeVisible()

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

  const productRegion = page.getByRole('region', { name: 'Thrumshift' })
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
