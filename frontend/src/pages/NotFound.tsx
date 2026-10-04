import React from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'

export const NotFound: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-4">
      <div className="w-16 h-16 rounded-3xl bg-brand-500/10 border border-brand-500/20 text-brand-400 font-display font-bold text-3xl flex items-center justify-center mb-6">
        404
      </div>
      <h1 className="text-xl font-bold font-display text-white tracking-tight">
        Page Introuvable
      </h1>
      <p className="text-xs text-ink-400 max-w-sm mt-2 mb-6">
        L'écran ou la ressource que vous recherchez n'existe pas ou a été déplacée.
      </p>
      <Link to="/">
        <Button variant="primary" size="md">
          Retour au Tableau de Bord
        </Button>
      </Link>
    </div>
  )
}
