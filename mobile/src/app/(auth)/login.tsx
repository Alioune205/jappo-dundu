import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, type TextInput } from 'react-native'
import { Link, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { AuthShell, enter } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import { TextField } from '@/components/ui/TextField'
import { useAuth, type SocialProvider } from '@/context/AuthContext'
import { SocialButtons } from '@/features/auth/SocialButtons'
import { ApiError } from '@/lib/api'
import { space } from '@/theme'

/**
 * Connexion : numéro de téléphone (ou identifiant) et mot de passe. Un échec
 * fait « non » de la tête au formulaire, avec une vibration d'erreur.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function LoginScreen() {
  const { login, socialLogin } = useAuth()
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<TextInput>(null)
  const shake = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

  const fail = (message: string) => {
    setError(message)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    shake.set(withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(9, { duration: 70 }),
      withTiming(-6, { duration: 70 }),
      withTiming(3, { duration: 60 }),
      withTiming(0, { duration: 50 })
    ))
  }

  const submit = async () => {
    if (!identifier.trim() || !password) return fail('Renseignez votre numéro et votre mot de passe.')
    setSubmitting(true)
    setError(null)
    try {
      await login(identifier.trim(), password)
      router.replace('/alerts')
    } catch (err) {
      fail(
        err instanceof ApiError && err.status === 401
          ? 'Numéro ou mot de passe incorrect.'
          : err instanceof Error
            ? err.message
            : 'Connexion impossible.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const social = async (provider: SocialProvider, payload: Record<string, string>) => {
    const { profileComplete } = await socialLogin(provider, payload)
    router.replace(profileComplete ? '/alerts' : '/complete-profile')
  }

  return (
    <AuthShell
      hero
      title="Bon retour parmi nous."
      subtitle="Connectez-vous pour voir les demandes de sang près de chez vous."
      onBack={router.canGoBack() ? () => router.back() : undefined}
      footer={
        <Link href="/register" replace asChild>
          <Pressable hitSlop={8} accessibilityRole="link">
            <Text variant="label" tone="muted">
              Pas encore de compte ?{' '}
              <Text variant="label" tone="brand">
                Créer un compte
              </Text>
            </Text>
          </Pressable>
        </Link>
      }
    >
      <Animated.View style={[styles.fields, shakeStyle]}>
        <Animated.View entering={enter(1)}>
          <TextField
            label="Téléphone ou identifiant"
            icon="user"
            placeholder="77 123 45 67"
            value={identifier}
            onChangeText={(value) => {
              setIdentifier(value)
              setError(null)
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </Animated.View>
        <Animated.View entering={enter(2)}>
          <TextField
            ref={passwordRef}
            label="Mot de passe"
            icon="lock"
            password
            placeholder="Votre mot de passe"
            value={password}
            onChangeText={(value) => {
              setPassword(value)
              setError(null)
            }}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={error ?? undefined}
          />
        </Animated.View>
      </Animated.View>
      <Animated.View entering={enter(3)} style={styles.forgot}>
        <Pressable
          onPress={() => router.push({ pathname: '/forgot-password', params: { identifier: identifier.trim() } })}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Text variant="label" tone="brand">
            Mot de passe oublié ?
          </Text>
        </Pressable>
      </Animated.View>
      <Animated.View entering={enter(4)}>
        <Button label="Se connecter" onPress={submit} loading={submitting} haptic />
      </Animated.View>
      <Animated.View entering={enter(5)}>
        <SocialButtons label="ou continuer avec" onToken={social} />
      </Animated.View>
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  fields: { gap: space.lg },
  forgot: { alignSelf: 'flex-end', marginTop: -space.sm },
})
