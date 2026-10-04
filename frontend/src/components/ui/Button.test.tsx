import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button component', () => {
  it('renders children correctly', () => {
    render(<Button>Cliquez ici</Button>)
    expect(screen.getByRole('button', { name: /Cliquez ici/i })).toBeInTheDocument()
  })

  it('handles click events', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Action</Button>)
    fireEvent.click(screen.getByRole('button', { name: /Action/i }))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('disables button when isLoading is true', () => {
    const handleClick = vi.fn()
    render(
      <Button isLoading onClick={handleClick}>
        Sauvegarder
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('disables button when disabled prop is provided', () => {
    render(<Button disabled>Désactivé</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
