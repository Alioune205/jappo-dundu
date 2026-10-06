import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { Landing } from './Landing'

const auth = vi.hoisted(() => ({ isAuthenticated: false }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }))

describe('Landing', () => {
  it('présente les informations essentielles du don de sang', () => {
    auth.isAuthenticated = false
    renderWithProviders(<Landing />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/sauver des vies/)
    // Conditions du CNTS, groupes en tension, sites et contact.
    expect(screen.getByText('18 à 60 ans')).toBeInTheDocument()
    expect(screen.getByText('50 kg minimum')).toBeInTheDocument()
    expect(screen.getByText('O−')).toBeInTheDocument()
    expect(screen.getByText('CNTS — Siège national')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /itinéraire/i })).toHaveLength(3)
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
