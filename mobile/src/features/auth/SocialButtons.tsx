import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Facebook from 'expo-auth-session/providers/facebook'
import * as Google from 'expo-auth-session/providers/google'
import * as WebBrowser from 'expo-web-browser'
import Svg, { Circle, Path } from 'react-native-svg'
import { Text } from '@/components/ui/Text'
import type { SocialProvider } from '@/context/AuthContext'
import { OAUTH } from '@/lib/config'
import { radius, space, useTheme } from '@/theme'

// Web : referme la fenêtre du fournisseur et rend la main à l'application.
WebBrowser.maybeCompleteAuthSession()

type Submit = (provider: SocialProvider, payload: Record<string, string>) => Promise<void>

interface SocialButtonsProps {
  /** Libellé du séparateur (« ou continuer avec »). */
  label: string
  onToken: Submit
}

const googleClientId = Platform.select({
  android: OAUTH.google.androidClientId,
  ios: OAUTH.google.iosClientId,
  default: OAUTH.google.webClientId,
})
const googleReady = !!googleClientId
const facebookReady = !!OAUTH.facebookAppId
/** Apple : iOS uniquement (exigence de l'App Store dès qu'une connexion sociale est proposée). */
const appleCandidate = Platform.OS === 'ios'

/**
 * Connexion par Google, Facebook ou Apple. Le jeton obtenu auprès du
 * fournisseur est envoyé au backend, qui le vérifie avant d'ouvrir une
 * session (backend/identity/social.py).
 *
 * Un fournisseur non configuré (identifiants OAuth absents, voir
 * mobile/README.md) reste visible en développement avec une explication,
 * et disparaît des versions publiées.
 */
export function SocialButtons({ label, onToken }: SocialButtonsProps) {
  const { colors } = useTheme()
  const [busy, setBusy] = useState<SocialProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [appleAvailable, setAppleAvailable] = useState(false)

  useEffect(() => {
    if (appleCandidate) AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => undefined)
  }, [])

  const run = async (provider: SocialProvider, payload: Record<string, string>) => {
    setBusy(provider)
    setError(null)
    try {
      await onToken(provider, payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.')
    } finally {
      setBusy(null)
    }
  }
  const missing = (name: string) => () =>
    setError(`${name} n’est pas encore configuré : renseignez ses identifiants OAuth dans mobile/.env (voir README).`)

  const showGoogle = googleReady || __DEV__
  const showFacebook = facebookReady || __DEV__
  const showApple = appleAvailable
  if (!showGoogle && !showFacebook && !showApple) return null

  return (
    <View style={styles.wrapper}>
      <View style={styles.divider}>
        <View style={[styles.rule, { backgroundColor: colors.line }]} />
        <Text variant="caption" tone="subtle">
          {label}
        </Text>
        <View style={[styles.rule, { backgroundColor: colors.line }]} />
      </View>
      {showGoogle &&
        (googleReady ? (
          <GoogleButton busy={busy === 'google'} disabled={!!busy} onIdToken={(id_token) => run('google', { id_token })} onError={setError} />
        ) : (
          <ProviderButton provider="google" onPress={missing('Google')} />
        ))}
      {showFacebook &&
        (facebookReady ? (
          <FacebookButton busy={busy === 'facebook'} disabled={!!busy} onAccessToken={(access_token) => run('facebook', { access_token })} onError={setError} />
        ) : (
          <ProviderButton provider="facebook" onPress={missing('Facebook')} />
        ))}
      {showApple && (
        <ProviderButton
          provider="apple"
          busy={busy === 'apple'}
          disabled={!!busy}
          onPress={async () => {
            try {
              const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                  AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                  AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
              })
              if (!credential.identityToken) throw new Error('Apple n’a pas transmis de jeton.')
              await run('apple', {
                identity_token: credential.identityToken,
                // Apple ne donne le nom qu'à la première autorisation : on le transmet tout de suite.
                first_name: credential.fullName?.givenName ?? '',
                last_name: credential.fullName?.familyName ?? '',
              })
            } catch (err) {
              const code = (err as { code?: string }).code
              if (code !== 'ERR_REQUEST_CANCELED') setError(err instanceof Error ? err.message : 'Connexion Apple impossible.')
            }
          }}
        />
      )}
      {error ? (
        <Text variant="caption" tone="brand" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

function GoogleButton({
  busy,
  disabled,
  onIdToken,
  onError,
}: {
  busy: boolean
  disabled: boolean
  onIdToken: (token: string) => void
  onError: (message: string) => void
}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: OAUTH.google.androidClientId,
    iosClientId: OAUTH.google.iosClientId,
    webClientId: OAUTH.google.webClientId,
  })
  const handlers = useLatest({ onIdToken, onError })
  // Une réponse du fournisseur = un seul envoi au serveur, quels que soient les rendus suivants.
  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) handlers.current.onIdToken(response.params.id_token)
    else if (response?.type === 'error') handlers.current.onError(response.error?.message ?? 'Connexion Google impossible.')
  }, [response, handlers])
  return <ProviderButton provider="google" busy={busy} disabled={disabled || !request} onPress={() => promptAsync()} />
}

function FacebookButton({
  busy,
  disabled,
  onAccessToken,
  onError,
}: {
  busy: boolean
  disabled: boolean
  onAccessToken: (token: string) => void
  onError: (message: string) => void
}) {
  const [request, response, promptAsync] = Facebook.useAuthRequest({ clientId: OAUTH.facebookAppId })
  const handlers = useLatest({ onAccessToken, onError })
  useEffect(() => {
    const token = response?.type === 'success' ? (response.authentication?.accessToken ?? response.params.access_token) : null
    if (token) handlers.current.onAccessToken(token)
    else if (response?.type === 'error') handlers.current.onError(response.error?.message ?? 'Connexion Facebook impossible.')
  }, [response, handlers])
  return <ProviderButton provider="facebook" busy={busy} disabled={disabled || !request} onPress={() => promptAsync()} />
}

/** Référence toujours à jour vers les derniers rappels, sans relancer les effets. */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

const LABELS: Record<SocialProvider, string> = {
  google: 'Continuer avec Google',
  facebook: 'Continuer avec Facebook',
  apple: 'Continuer avec Apple',
}

function ProviderButton({
  provider,
  onPress,
  busy = false,
  disabled = false,
}: {
  provider: SocialProvider
  onPress: () => void
  busy?: boolean
  disabled?: boolean
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={LABELS[provider]}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.lineStrong, backgroundColor: pressed ? colors.raised : colors.surface, opacity: disabled && !busy ? 0.6 : 1 },
      ]}
    >
      <View style={styles.logo}>{busy ? <ActivityIndicator size="small" color={colors.fg} /> : <Logo provider={provider} color={colors.fg} />}</View>
      <Text variant="bodyStrong">{LABELS[provider]}</Text>
    </Pressable>
  )
}

/** Logos officiels (couleurs des chartes Google, Meta et Apple). */
function Logo({ provider, color }: { provider: SocialProvider; color: string }) {
  if (provider === 'google') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <Path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
        <Path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
        <Path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
      </Svg>
    )
  }
  if (provider === 'facebook') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={11} fill="#FFFFFF" />
        <Path
          fill="#1877F2"
          d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07"
        />
      </Svg>
    )
  }
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.65zM14.1 5.9c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.27z"
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: space.md },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.xs },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  button: {
    height: 52,
    borderRadius: radius.md + 4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  logo: { width: 22, alignItems: 'center' },
  error: { textAlign: 'center' },
})
