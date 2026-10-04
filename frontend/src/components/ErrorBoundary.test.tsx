import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

let shouldThrow = true
const Fragile: React.FC = () => {
  if (shouldThrow) throw new Error('lit sans établissement')
  return <p>Module rétabli</p>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true
    // React journalise l'erreur interceptée : on garde la sortie des tests lisible.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('isole la panne : le reste de l’écran reste affiché', () => {
    render(
      <div>
        <nav>Navigation</nav>
        <ErrorBoundary>
          <Fragile />
        </ErrorBoundary>
      </div>
    )
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Ce module a rencontré une erreur')
    expect(screen.getByRole('alert')).toHaveTextContent('lit sans établissement')
  })

  it('« Réessayer » remonte le module', () => {
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>
    )
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(screen.getByText('Module rétabli')).toBeInTheDocument()
  })

  it('changer de page (resetKey) efface l’erreur', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/beds">
        <Fragile />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    shouldThrow = false
    rerender(
      <ErrorBoundary resetKey="/blood">
        <Fragile />
      </ErrorBoundary>
    )
    expect(screen.getByText('Module rétabli')).toBeInTheDocument()
  })
})
