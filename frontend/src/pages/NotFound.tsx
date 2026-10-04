import React from 'react'
import { Link } from 'react-router'

export const NotFound: React.FC = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="num text-3xl font-medium text-subtle">404</p>
      <h1 className="mt-2 text-base font-semibold text-fg">Page introuvable</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex h-8 items-center rounded bg-inverse px-3 text-sm font-medium text-on-inverse hover:opacity-90"
      >
        Retour au tableau de bord
      </Link>
    </div>
  )
}
