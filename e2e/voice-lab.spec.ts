import { expect, test } from '@playwright/test'

test('isolated lab works with unavailable APIs and large keyboard controls', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      configurable: true,
    })
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      value: undefined,
      configurable: true,
    })
    Object.defineProperty(navigator, 'bluetooth', {
      value: undefined,
      configurable: true,
    })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/voice-lab')
  await expect(
    page.getByRole('heading', { name: 'Voice Lab', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Speak command · new trial' }),
  ).toBeDisabled()
  await expect(
    page.getByText('Recognition: unsupported · Synthesis: unsupported'),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Development diagnostics' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Mission statistics' }),
  ).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  const downloadButton = page.getByRole('button', {
    name: 'Download session JSON',
  })
  await downloadButton.focus()
  await expect(downloadButton).toBeFocused()
  expect(
    await downloadButton.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe('none')
  const download = page.waitForEvent('download')
  await page.keyboard.press('Enter')
  expect((await download).suggestedFilename()).toBe('thrumshift-voice-lab.json')
  await page.reload()
  await expect(page.getByText(/0 trials · First attempt —/)).toBeVisible()
})

test('injected browser speech preserves heard/interpreted separation and retry grouping', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const transcripts = ['stop auxiliary pump', 'start the auxiliary pump']
    class Recognition {
      onstart: (() => void) | null = null
      onresult: ((event: unknown) => void) | null = null
      start() {
        this.onstart?.()
        setTimeout(
          () =>
            this.onresult?.({
              resultIndex: 0,
              results: [
                Object.assign(
                  [{ transcript: transcripts.shift(), confidence: 0.8 }],
                  { isFinal: true },
                ),
              ],
            }),
          50,
        )
      }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', {
      value: Recognition,
      configurable: true,
    })
    Object.defineProperty(navigator, 'bluetooth', {
      value: undefined,
      configurable: true,
    })
  })
  await page.goto('/voice-lab/')
  await page.getByLabel('Expected command').selectOption('START_AUX_PUMP')
  await page.getByRole('button', { name: 'Speak command · new trial' }).click()
  await expect(page.locator('blockquote')).toHaveText('stop auxiliary pump')
  await expect(
    page.getByText('STOP AUXILIARY PUMP', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Retry last trial · attempt 2' })
    .click()
  await expect(page.locator('blockquote')).toHaveText(
    'start the auxiliary pump',
  )
  await expect(
    page.getByText('START AUXILIARY PUMP', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      /1 trials · First attempt 0% · Within two 100% · Wrong intents 1/,
    ),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  const control = page.getByRole('button', {
    name: 'Speak command · new trial',
  })
  expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(64)
})
