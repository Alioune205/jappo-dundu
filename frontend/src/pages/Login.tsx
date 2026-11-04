import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Activity,
  Ambulance,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Check,
  Droplets,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { DEMO_ACCOUNTS } from '@/lib/demoAccounts'
import { BrandMark, BrandName } from '@/components/layout/BrandMark'

/** Icône et couleur des comptes de démonstration, par identifiant. */
const DEMO_STYLE: Record<string, { icon: React.ElementType; text: string; soft: string }> = {
  admin: { icon: ShieldCheck, text: 'text-fg', soft: 'bg-raised' },
  'dr.diop': { icon: BedDouble, text: 'text-accent-blue', soft: 'bg-accent-blue/10' },
  'cnts.dakar': { icon: Droplets, text: 'text-accent-red', soft: 'bg-accent-red/10' },
  'samu.regulation': { icon: Ambulance, text: 'text-accent-green', soft: 'bg-accent-green/10' },
}

const MODULES = [
  { icon: Droplets, label: 'Sang' },
  { icon: BedDouble, label: 'Lits' },
  { icon: Ambulance, label: 'Ambulances' },
]

const fieldClass =
  'h-12 w-full rounded-xl border border-line-strong bg-surface pl-11 text-[0.9375rem] text-fg outline-none transition-all placeholder:text-subtle hover:border-fg/35 focus:border-brand focus:ring-3 focus:ring-brand/12'

/**
 * Connexion de l'espace professionnel. Architecture épurée de haut niveau,
 * harmonisée avec la page d'accueil et les tableaux de bord.
 */
export const Login: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [needOtp, setNeedOtp] = useState(false)
  const [otp, setOtp] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setErrorMsg('Veuillez renseigner votre identifiant et votre mot de passe.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)
    try {
      await login(username, password, needOtp ? otp : undefined)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const code = (err as { data?: { code?: string } })?.data?.code
      if (code === 'otp_required') {
        setNeedOtp(true)
        setErrorMsg(null)
        return
      }
      const message = err instanceof Error ? err.message : 'Impossible de vous connecter. Vérifiez vos identifiants.'
      setErrorMsg(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const demo = DEMO_ACCOUNTS

  const fillCredentials = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
    setErrorMsg(null)
  }

  const watchCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'))

  return (
    <div className="landing grid min-h-full bg-canvas text-fg lg:grid-cols-[1.02fr_0.98fr]">
      {/* Volet photo & télémétrie (grand écran) */}
      <aside className="relative hidden overflow-hidden bg-navy lg:sticky lg:top-0 lg:block lg:h-screen">
        <picture>
          <source srcSet="/images/landing/dashboard-background.webp" type="image/webp" />
          <img
            src="/images/landing/dashboard-background.jpg"
            alt="Un médecin suit le tableau de bord de son établissement"
            className="absolute inset-0 h-full w-full object-cover object-[42%_50%]"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-navy/70 via-navy/35 to-navy/95" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <div className="flex items-center justify-between">
            <Link to="/bienvenue" className="flex items-center gap-2.5">
              <span className="rounded-xl bg-white/95 p-1 shadow-sm">
                <BrandMark className="h-8 w-8" />
              </span>
              <span className="text-lg font-bold tracking-tight">Jappo Dundu</span>
            </Link>
            <Link
              to="/bienvenue"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-md transition-colors hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Accueil
            </Link>
          </div>

          <div className="space-y-6">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-label text-[11px] font-semibold text-amber backdrop-blur-xs">
                <span className="live-pulse h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
                Espace professionnel
              </p>
              <p className="font-display mt-4 max-w-lg text-4xl font-semibold leading-[1.06] tracking-tight xl:text-5xl">
                Chaque minute compte. <em className="serif text-amber">Chaque lit aussi.</em>
              </p>
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">
                Hôpitaux, centres de transfusion et SAMU : une seule plateforme pour le sang, les lits et les
                ambulances, en temps réel.
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-navy/75 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                  <Activity className="h-3.5 w-3.5 text-accent-green" aria-hidden="true" />
                  Infrastructure nationale active
                </span>
                <span className="rounded-full bg-accent-green/20 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                  Chiffré · RBAC
                </span>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {MODULES.map((m) => (
                  <li
                    key={m.label}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white"
                  >
                    <m.icon className="h-3.5 w-3.5 text-amber" aria-hidden="true" />
                    {m.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </aside>

      {/* Formulaire */}
      <main className="relative flex flex-col justify-between overflow-hidden px-5 py-8 sm:px-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-48 -top-48 h-[28rem] w-[28rem] rounded-full bg-amber-soft opacity-70 blur-3xl"
        />
        <div className="relative flex items-center justify-between lg:hidden">
          <Link to="/bienvenue" className="flex items-center gap-2">
            <BrandMark className="h-9 w-9" />
            <BrandName className="text-base" />
          </Link>
          <Link to="/bienvenue" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Accueil
          </Link>
        </div>

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8 lg:py-4">
          <div className="reveal rounded-[1.75rem] border border-line bg-surface p-6 shadow-[var(--shadow-raised)] sm:p-8">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.06] px-3 py-1 font-label text-[10px] font-semibold text-brand">
              Espace professionnel
            </p>
            <h1 className="font-display mt-3.5 text-3xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-4xl">
              Connexion à votre <span className="highlight">espace</span>
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">
              Administrateurs des lits, du sang, des ambulances et supervision nationale.
            </p>

            {errorMsg && (
              <Alert tone="danger" className="mt-5" onClose={() => setErrorMsg(null)}>
                {errorMsg}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-fg">
                  Identifiant
                </label>
                <div className="relative">
                  <UserRound
                    className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-subtle"
                    aria-hidden="true"
                  />
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    autoComplete="username"
                    autoFocus
                    placeholder="ex. dr.diop"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`${fieldClass} pr-4`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-fg">
                  Mot de passe
                </label>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-subtle"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={watchCapsLock}
                    onKeyDown={watchCapsLock}
                    aria-describedby={capsLock ? 'caps-lock' : undefined}
                    className={`${fieldClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
                {capsLock && (
                  <p id="caps-lock" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    Majuscules activées
                  </p>
                )}
              </div>

              {needOtp && (
                <div>
                  <label htmlFor="otp" className="mb-1.5 block text-xs font-semibold text-fg">
                    Code de votre application d’authentification
                  </label>
                  <input
                    id="otp"
                    name="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className={`${fieldClass} num tracking-[0.4em]`}
                    placeholder="000000"
                  />
                  <p className="mt-2 text-xs text-muted">Double authentification activée sur ce compte.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting || undefined}
                className="mt-2 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand text-base font-semibold text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                  </svg>
                ) : (
                  <>
                    Se connecter
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-4 flex items-start gap-2 text-xs text-muted">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Mot de passe oublié ? Contactez l’administrateur général de la plateforme.
            </p>
          </div>

          {/* Comptes de démonstration : absents des builds de production (lib/demoAccounts). */}
          {demo && (
            <div className="mt-5 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-label text-[10px] font-semibold text-muted">Comptes de démonstration · 1 clic</p>
                <p className="text-xs text-muted">
                  Mot de passe : <span className="num font-semibold text-fg">{demo.password}</span>
                </p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {demo.accounts.map((account) => {
                  const style = DEMO_STYLE[account.username] ?? DEMO_STYLE.admin
                  const Icon = style.icon
                  const selected = username === account.username
                  return (
                    <button
                      key={account.username}
                      title={`${account.label} (${account.username})`}
                      type="button"
                      onClick={() => fillCredentials(account.username, demo.password)}
                      className={`group flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all ${
                        selected
                          ? 'border-brand bg-brand/[0.04] ring-2 ring-brand/15'
                          : 'border-line bg-canvas/50 hover:border-line-strong hover:bg-raised/50'
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.soft}`}>
                        <Icon className={`h-4 w-4 ${style.text}`} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-fg">{account.label}</span>
                        <span className="block truncate text-[11px] text-muted">{account.username}</span>
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-md space-y-1.5 pt-4 text-center text-xs text-subtle">
          <p>Accès réservé au personnel habilité. Les connexions sont journalisées.</p>
          <p>
            Vous souhaitez donner votre sang ?{' '}
            <Link to="/bienvenue#don" className="font-semibold text-brand hover:text-brand-strong">
              Découvrir Jappo Dundu
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
