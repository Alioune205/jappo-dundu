/**
 * Scénarios critiques de régulation, de bout en bout (navigateur → Vite →
 * Django/Daphne → PostGIS / Redis → WebSocket → navigateur).
 */
import { expect, test } from '@playwright/test'
import { expectRealtimeConnected, firstNumber, loginAs, menuLink } from './helpers'

test('connexion et flux temps réel par ticket, sans JWT dans l’URL', async ({ page }) => {
  const socketUrls: string[] = []
  page.on('websocket', (ws) => socketUrls.push(ws.url()))

  await loginAs(page)
  await expect(page.getByRole('heading', { name: 'Supervision nationale' })).toBeVisible()
  await expectRealtimeConnected(page)

  expect(socketUrls.length).toBeGreaterThanOrEqual(2) // alertes + tableau de bord
  for (const url of socketUrls.filter((u) => u.includes('/ws/'))) {
    expect(url).toContain('ticket=')
    expect(url).not.toContain('token=')
  }
})

test('SAMU : une mission déclenchée reçoit l’ambulance la plus proche, puis avance', async ({ page }) => {
  await loginAs(page)
  await menuLink(page, 'Flotte SAMU').click()
  await expect(page.getByRole('heading', { name: 'Flotte SAMU' })).toBeVisible()

  const address = `Place de l'Indépendance — E2E ${Date.now()}`
  await page.getByRole('button', { name: 'Nouvelle mission' }).click()
  await page.getByLabel('Adresse ou point de repère').fill(address)
  await page.getByLabel('Motif de l’appel').or(page.getByLabel("Motif de l'appel")).fill('Malaise sur la voie publique')
  await page.getByRole('button', { name: 'Déclencher' }).click()

  // L'affectation PostGIS s'enchaîne automatiquement après la création.
  const row = page.getByRole('row').filter({ hasText: address })
  await expect(row).toBeVisible()
  await expect(row.getByText('Ambulance en route')).toBeVisible()
  const plate = row.locator('td').nth(3)
  await expect(plate).not.toHaveText(/Aucun/)

  // Cycle de vie : arrivée sur place.
  await row.getByRole('button', { name: 'Sur place' }).click()
  await expect(row.getByRole('button', { name: 'Début transport' })).toBeVisible()
  await expect(row.getByText('Ambulance sur place')).toBeVisible()
})

test('lits : une admission apparaît en temps réel chez un autre régulateur', async ({ browser }) => {
  const operatorA = await browser.newPage()
  const operatorB = await browser.newPage()
  try {
    await loginAs(operatorA)
    await loginAs(operatorB)
    for (const page of [operatorA, operatorB]) {
      await menuLink(page, 'Capacité en lits').click()
      await expectRealtimeConnected(page)
    }

    // Premier service où une admission est possible.
    const rowA = operatorA
      .locator('tbody tr')
      .filter({ has: operatorA.getByRole('button', { name: /Entrée/, disabled: false }) })
      .first()
    await expect(rowA).toBeVisible()
    const service = (await rowA.locator('td').first().innerText()).split('\n')
    const [category, facility] = service.map((part) => part.trim())

    const rowB = operatorB.locator('tbody tr').filter({ hasText: category }).filter({ hasText: facility })
    const occupiedBefore = firstNumber(await rowB.locator('td').nth(4).innerText())

    await rowA.getByRole('button', { name: /Entrée/ }).click()
    await expect(rowA.locator('td').nth(4)).toContainText(String(occupiedBefore + 1))

    // Le second poste n'a rien rechargé : la mise à jour arrive par WebSocket.
    await expect(rowB.locator('td').nth(4)).toContainText(String(occupiedBefore + 1), { timeout: 10_000 })
  } finally {
    await operatorA.close()
    await operatorB.close()
  }
})

test('une page inconnue affiche un écran propre et un retour au tableau de bord', async ({ page }) => {
  await loginAs(page)
  await page.goto('/module-inexistant')
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible()
  await page.getByRole('link', { name: 'Retour au tableau de bord' }).click()
  await expect(page.getByRole('heading', { name: 'Supervision nationale' })).toBeVisible()
})
