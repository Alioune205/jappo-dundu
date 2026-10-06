import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { Login } from './Login'

const auth = vi.hoisted(() => ({ login: vi.fn() }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }))

describe('Login', () => {
  it('remplit le formulaire depuis un compte de démonstration et se connecte', async () => {
    auth.login.mockResolvedValue(undefined)
    renderWithProviders(<Login />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connexion à votre espace')

    fireEvent.click(screen.getByRole('button', { name: /Admin\. du sang/ }))
    expect(screen.getByLabelText('Identifiant')).toHaveValue('cnts.dakar')

    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }))
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('cnts.dakar', 'Password123!'))
  })

  it('affiche ou masque le mot de passe, et signale les champs vides', () => {
    renderWithProviders(<Login />)
    const password = screen.getByLabelText('Mot de passe')
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(password).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }))
    expect(screen.getByText(/Veuillez renseigner votre identifiant/)).toBeInTheDocument()
  })
})
