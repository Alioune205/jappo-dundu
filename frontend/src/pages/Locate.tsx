import React, { useState } from 'react'
import { useParams } from 'react-router'
import { CheckCircle2, MapPin, Phone } from 'lucide-react'
import { BrandMark, BrandName } from '@/components/layout/BrandMark'

type State =
  { step: 'idle' } | { step: 'locating' } | { step: 'sent'; message: string } | { step: 'error'; message: string }

/**
 * Page ouverte depuis le SMS de la régulation : l'appelant envoie sa position
 * GPS en un geste, sans compte ni application. Rien d'autre n'est affiché
 * (ni nom, ni détail de la mission).
 */
export const Locate: React.FC = () => {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ step: 'idle' })

  const send = () => {
    if (!('geolocation' in navigator)) {
      setState({ step: 'error', message: 'Votre téléphone ne permet pas la localisation : appelez le 1515.' })
      return
    }
    setState({ step: 'locating' })
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const response = await fetch(`/api/ambulances/locate/${encodeURIComponent(token)}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(body.detail || 'Envoi impossible.')
          setState({ step: 'sent', message: body.detail })
        } catch (err) {
          setState({ step: 'error', message: err instanceof Error ? err.message : 'Envoi impossible.' })
        }
      },
      () =>
        setState({
          step: 'error',
          message: 'Position refusée : autorisez la localisation dans votre navigateur, ou appelez le 1515.',
        }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    )
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 bg-canvas px-5 py-10 text-center">
      <div className="flex items-center gap-2">
        <BrandMark className="h-9 w-9" />
        <BrandName className="text-lg" />
      </div>
      {state.step === 'sent' ? (
        <div className="max-w-sm space-y-3">
          <CheckCircle2 className="mx-auto h-14 w-14 text-ok" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-fg">Position envoyée</h1>
          <p className="text-muted">{state.message}</p>
        </div>
      ) : (
        <div className="max-w-sm space-y-5">
          <h1 className="text-2xl font-bold text-fg">Envoyer votre position au SAMU</h1>
          <p className="text-muted">
            Touchez le bouton, puis acceptez la localisation : l’ambulance saura où vous trouver.
          </p>
          <button
            type="button"
            onClick={send}
            disabled={state.step === 'locating'}
            className="inline-flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand text-lg font-bold text-on-brand disabled:opacity-60"
          >
            <MapPin className="h-6 w-6" aria-hidden="true" />
            {state.step === 'locating' ? 'Localisation…' : 'Envoyer ma position'}
          </button>
          {state.step === 'error' && (
            <p role="alert" className="text-sm font-semibold text-critical">
              {state.message}
            </p>
          )}
          <a href="tel:1515" className="inline-flex items-center gap-2 text-sm font-semibold text-fg underline">
            <Phone className="h-4 w-4" aria-hidden="true" /> Appeler le 1515
          </a>
        </div>
      )}
    </main>
  )
}
