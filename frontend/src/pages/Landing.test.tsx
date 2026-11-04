import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { Landing } from './Landing'

const auth = vi.hoisted(() => ({ isAuthenticated: false }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }))

describe('Landing', () => {
  it('présente les trois modules au même niveau, et le don de sang', () => {
    auth.isAuthenticated = false
    renderWithProviders(<Landing />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Mieux coordonner\s*les ressources\.\s*Sauver des vies\./)
    for (const name of ['Jappo Sang', 'Jappo Lits', 'Jappo Ambulance']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    // Parcours d'une urgence, vision, sécurité, don de sang.
    expect(screen.getByRole('heading', { name: 'L’appel arrive au SAMU' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Une solution essentielle/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vos données, notre priorité' })).toBeInTheDocument()
    expect(screen.getByText('Avoir entre 18 et 60 ans')).toBeInTheDocument()
    // Groupes en tension publiés par le CNTS (l'alerte du téléphone illustre aussi O−).
    expect(within(screen.getByRole('list', { name: 'Groupes recherchés' })).getByText('O−')).toBeInTheDocument()
    // La source et la mention « non officiel » restent visibles.
    expect(screen.getByText(/n’est pas un service officiel du CNTS/)).toBeInTheDocument()
  })

  it("mène à la connexion, ou à l'espace du compte déjà connecté", () => {
    auth.isAuthenticated = false
    const { unmount } = renderWithProviders(<Landing />)
    expect(screen.getAllByRole('link', { name: /espace pro/i })[0]).toHaveAttribute('href', '/login')
    unmount()

    auth.isAuthenticated = true
    renderWithProviders(<Landing />)
    expect(screen.getAllByRole('link', { name: /mon espace/i })[0]).toHaveAttribute('href', '/')
  })
})
