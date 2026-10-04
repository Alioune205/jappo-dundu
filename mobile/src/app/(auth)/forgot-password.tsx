import React, { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type TextInput } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated'
import { AuthShell, enter } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { OtpInput } from '@/components/ui/OtpInput'
import { Text } from '@/components/ui/Text'
import { TextField } from '@/components/ui/TextField'
import { useAuth } from '@/context/AuthContext'
import { PasswordStrength } from '@/features/auth/PasswordStrength'
import { api, ApiError } from '@/lib/api'
import { motion, radius, space, useTheme } from '@/theme'
import type { TokenPair } from '@/types/api'

const RESEND_AFTER_S = 60

/**
 * Mot de passe oublié, en deux temps :
 * 1. numéro (ou identifiant) → code à 6 chiffres par SMS ;
 * 2. code + nouveau mot de passe → session ouverte directement.
 * Le serveur répond de la même façon que le compte existe ou non.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function ForgotPasswordScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { signInWithTokens } = useAuth()
  const params = useLocalSearchParams<{ identifier?: string }>()
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [identifier, setIdentifier] = useState(params.identifier ?? '')
  const [notice, setNotice] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [busy, setBusy] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [wait, setWait] = useState(0)
  const passwordRef = useRef<TextInput>(null)

  // Compte à rebours avant de pouvoir redemander un code.
  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const requestCode = async () => {
    if (!identifier.trim()) return setErrors({ identifier: 'Renseignez votre numéro de téléphone.' })
    setBusy(true)
    setErrors({})
    try {
      const { detail } = await api.post<{ detail: string }>('/api/auth/password-reset/', { identifier: identifier.trim() }, false)
      setNotice(detail)
      setStep('reset')
      setWait(RESEND_AFTER_S)
      setCode('')
    } catch (err) {
      setErrors({ identifier: err instanceof Error ? err.message : 'Envoi impossible.' })
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    const local: Record<string, string> = {}
    if (code.length !== 6) local.code = 'Saisissez les 6 chiffres reçus.'
    if (password.length < 8) local.password = '8 caractères minimum.'
    else if (confirm !== password) local.confirm = 'Les deux mots de passe diffèrent.'
    setErrors(local)
    if (Object.keys(local).length) {
      if (local.code) setShakeKey((k) => k + 1)
      return
    }
    setBusy(true)
    try {
      const tokens = await api.post<TokenPair>(
        '/api/auth/password-reset/confirm/',
        { identifier: identifier.trim(), code, new_password: password },
        false
      )
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await signInWithTokens(tokens)
      router.replace('/alerts')
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors({ code: err.fieldErrors.code?.[0], password: err.fieldErrors.new_password?.[0] })
        if (err.fieldErrors.code) {
          setShakeKey((k) => k + 1)
          setCode('')
        }
      } else {
        setErrors({ code: err instanceof Error ? err.message : 'Réinitialisation impossible.' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={step === 'request' ? 'Mot de passe oublié ?' : 'Saisissez le code.'}
      subtitle={
        step === 'request'
          ? 'Indiquez votre numéro : nous vous envoyons un code à 6 chiffres par SMS.'
          : 'Puis choisissez votre nouveau mot de passe. Vos autres sessions seront fermées.'
      }
      onBack={() => (step === 'reset' ? setStep('request') : router.canGoBack() ? router.back() : router.replace('/login'))}
    >
      {step === 'request' ? (
        <Animated.View key="request" entering={enter(1)} exiting={FadeOutLeft.duration(motion.fast)} style={styles.block}>
          <TextField
            label="Téléphone ou identifiant"
            icon="phone"
            placeholder="77 123 45 67"
            value={identifier}
            onChangeText={(value) => {
              setIdentifier(value)
              setErrors({})
            }}
            keyboardType="default"
            autoCapitalize="none"
            autoComplete="tel"
            returnKeyType="send"
            onSubmitEditing={requestCode}
            error={errors.identifier}
          />
          <Button label="Recevoir un code" onPress={requestCode} loading={busy} haptic />
        </Animated.View>
      ) : (
        <Animated.View key="reset" entering={FadeInRight.duration(motion.base).easing(motion.easeOut)} style={styles.block}>
          <View style={[styles.notice, { backgroundColor: colors.raised }]}>
            <Icon name="shield" size={18} color="ok" />
            <Text variant="caption" tone="muted" style={styles.flex}>
              {notice}
            </Text>
          </View>
          <OtpInput
            value={code}
            onChange={(value) => {
              setCode(value)
              setErrors((e) => ({ ...e, code: undefined }))
              if (value.length === 6) passwordRef.current?.focus()
            }}
            error={errors.code}
            shakeKey={shakeKey}
            autoFocus
          />
          <Pressable onPress={requestCode} disabled={wait > 0 || busy} hitSlop={8} accessibilityRole="button" style={styles.resend}>
            <Text variant="label" tone={wait > 0 ? 'subtle' : 'brand'}>
              {wait > 0 ? `Renvoyer le code dans ${wait} s` : 'Renvoyer le code'}
            </Text>
          </Pressable>
          <View style={styles.group}>
            <TextField
              ref={passwordRef}
              label="Nouveau mot de passe"
              icon="lock"
              password
              placeholder="8 caractères minimum"
              value={password}
              onChangeText={(value) => {
                setPassword(value)
                setErrors((e) => ({ ...e, password: undefined }))
              }}
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.password}
            />
            {!errors.password && <PasswordStrength password={password} />}
          </View>
          <TextField
            label="Confirmer le mot de passe"
            icon="lock"
            password
            placeholder="Le même, une seconde fois"
            value={confirm}
            onChangeText={(value) => {
              setConfirm(value)
              setErrors((e) => ({ ...e, confirm: undefined }))
            }}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={reset}
            error={errors.confirm}
          />
          <Button label="Changer mon mot de passe" onPress={reset} loading={busy} haptic />
        </Animated.View>
      )}
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: space.lg },
  group: { gap: space.md },
  notice: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
  resend: { alignSelf: 'flex-start', marginTop: -space.sm },
})
