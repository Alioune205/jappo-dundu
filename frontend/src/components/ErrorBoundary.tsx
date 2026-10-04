import React from 'react'
import { useRouteError } from 'react-router'

interface ErrorFallbackProps {
  error: unknown
  /** Remonte le composant défaillant (nouvelle tentative de rendu). */
  onRetry?: () => void
  /** Plein écran (racine de l'application) plutôt qu'encart de module. */
  fullScreen?: boolean
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Erreur inconnue.'
}

/** Écran de repli : explique, propose de réessayer ou de recharger. */
export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onRetry, fullScreen = false }) => (
  <div
    role="alert"
    className={`flex items-center justify-center ${fullScreen ? 'h-full bg-canvas p-4 text-fg' : 'min-h-[40vh] py-8'}`}
  >
    <div className="w-full max-w-md overflow-hidden rounded-md border border-line bg-surface">
      <div className="relative px-4 py-3">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-critical" />
        <h2 className="text-sm font-semibold text-fg">
          {fullScreen ? "L'application a rencontré une erreur" : 'Ce module a rencontré une erreur'}
        </h2>
        <p className="mt-1 text-xs text-muted">
          {fullScreen
            ? 'Rechargez la page pour reprendre. Vos données enregistrées ne sont pas affectées.'
            : 'Le reste de l’application fonctionne. Réessayez ou ouvrez un autre module.'}
        </p>
        <p className="num mt-2 break-words text-2xs text-subtle">{errorMessage(error)}</p>
        {import.meta.env.DEV && error instanceof Error && error.stack && (
          <pre className="num mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-2xs text-subtle">{error.stack}</pre>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-7 cursor-pointer items-center rounded border border-line-strong px-2.5 text-xs font-medium text-fg hover:bg-raised"
        >
          Recharger la page
        </button>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-7 cursor-pointer items-center rounded bg-inverse px-2.5 text-xs font-medium text-on-inverse hover:opacity-90"
          >
            Réessayer
          </button>
        )}
      </div>
    </div>
  </div>
)

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Changer cette clé (ex. chemin de la page) efface l'erreur. */
  resetKey?: unknown
  fullScreen?: boolean
}

interface ErrorBoundaryState {
  error: unknown
  hasError: boolean
  resetKey: unknown
}

/**
 * Barrière d'erreur : une exception de rendu dans un module n'emporte pas
 * tout le poste de travail, seulement l'encart concerné.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, hasError: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error, hasError: true }
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState) {
    // Navigation vers une autre page : on repart d'un état sain.
    if (props.resetKey !== state.resetKey) {
      return { error: null, hasError: false, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Erreur d’interface interceptée :', error, info.componentStack)
  }

  private retry = () => this.setState({ error: null, hasError: false })

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onRetry={this.retry} fullScreen={this.props.fullScreen} />
    }
    return this.props.children
  }
}

/** `errorElement` du routeur : erreurs remontées hors des barrières de module. */
export const RouteError: React.FC = () => {
  const error = useRouteError()
  return <ErrorFallback error={error} fullScreen />
}
