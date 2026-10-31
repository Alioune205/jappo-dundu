import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { StatusDot } from '@/components/ui/StatusDot'
import { Text } from '@/components/ui/Text'
import { TextField } from '@/components/ui/TextField'
import { useAuth } from '@/context/AuthContext'
import { timeAgo } from '@/lib/dates'
import { formatDistance } from '@/lib/location'
import {
  callSamu,
  isActiveSos,
  isNetworkFailure,
  SAMU_NUMBER,
  smsSamu,
  SOS_KINDS,
  useCancelSos,
  useMySos,
  useSendSos,
  type SosAlert,
  type SosKind,
} from '@/lib/sos'
import { HoldButton } from '@/components/ui/HoldButton'
import { useNow } from '@/lib/useNow'
import { motion, radius, space, useTheme } from '@/theme'
import { FULL_FEATURES } from '@/lib/features'

/**
 * Urgence médicale : le citoyen envoie sa position et la nature de
 * l'urgence au SAMU, qui le rappelle et envoie l'ambulance la plus proche ;
 * il suit ensuite l'arrivée des secours.
 *
 * L'alerte ne remplace pas l'appel : le 1515 reste proposé à chaque étape.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
/** « dans 7 min », « imminente ». */
function etaLabel(value: string, now: number) {
  const minutes = Math.round((new Date(value).getTime() - now) / 60_000)
  return minutes <= 1 ? 'imminente' : `dans ${minutes} min environ`
}

/** Conseils généraux si l'alerte ne porte pas encore de consignes (ancienne version du serveur). */
const FALLBACK_INSTRUCTIONS = [
  {
    code: 'stay_safe',
    title: 'En attendant les secours',
    steps: [
      'Restez auprès de la personne et parlez-lui.',
      'Après un accident, ne déplacez pas un blessé sauf danger immédiat.',
      'Si la personne est inconsciente mais respire, tournez-la sur le côté.',
      'Dégagez l’accès et envoyez quelqu’un guider l’ambulance.',
    ],
  },
]

export default function SosScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const sos = useMySos()
  const alert = sos.data

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={8}
          style={styles.back}
        >
          <Icon name="back" size={22} />
        </Pressable>
        <Text variant="eyebrow" tone="brand">
          Urgence médicale
        </Text>
      </View>

      {sos.isPending ? (
        <ActivityIndicator color={colors.muted} style={styles.loading} />
      ) : isActiveSos(alert) ? (
        <Tracking alert={alert!} />
      ) : (
        <SendForm last={alert ?? null} />
      )}
    </ScrollView>
  )
}

function SendForm({ last }: { last: SosAlert | null }) {
  const { colors } = useTheme()
  const router = useRouter()
  const send = useSendSos()
  const [kind, setKind] = useState<SosKind | null>(null)
  const [landmark, setLandmark] = useState('')

  return (
    <Animated.View entering={FadeIn.duration(motion.base)} style={styles.stack}>
      <View style={styles.intro}>
        <Text variant="display">Alerter le SAMU</Text>
        <Text variant="body" tone="muted">
          Votre position part au SAMU. Un régulateur vous rappelle et envoie l’ambulance la plus proche.
        </Text>
      </View>

      {last ? (
        <Card style={[styles.notice, { backgroundColor: colors.raised }]}>
          <Text variant="label">
            Dernière alerte : {last.status === 'completed' ? 'prise en charge terminée' : 'retirée'}
          </Text>
          <Text variant="caption" tone="muted">
            {last.description.replace(/^SOS — /, '')} · {timeAgo(last.created_at)}
          </Text>
        </Card>
      ) : null}

      <View style={styles.block} accessibilityRole="radiogroup" accessibilityLabel="Que se passe-t-il ?">
        <Text variant="label" tone="muted">
          Que se passe-t-il ?
        </Text>
        {SOS_KINDS.map((option) => {
          const selected = option.value === kind
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                Haptics.selectionAsync()
                setKind(option.value)
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              style={[
                styles.kind,
                { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : colors.surface },
              ]}
            >
              <View style={[styles.radio, { borderColor: selected ? colors.brand : colors.lineStrong }]}>
                {selected ? <View style={[styles.radioDot, { backgroundColor: colors.brand }]} /> : null}
              </View>
              <Text variant="bodyStrong">{option.label}</Text>
            </Pressable>
          )
        })}
      </View>

      <TextField
        label="Point de repère (facultatif)"
        placeholder="ex. devant la pharmacie, 2e étage"
        value={landmark}
        onChangeText={setLandmark}
        maxLength={255}
        hint="Aide l’ambulance à vous trouver."
      />

      {send.error && isNetworkFailure(send.error) && kind ? (
        <Card style={[styles.block, { borderColor: colors.brand }]}>
          <Text variant="heading">Pas de connexion Internet</Text>
          <Text variant="body" tone="muted">
            Envoyez l’alerte par SMS au {SAMU_NUMBER} (votre position GPS est jointe), ou appelez directement.
          </Text>
          <Button label={`Envoyer par SMS au ${SAMU_NUMBER}`} onPress={() => smsSamu(kind, landmark)} haptic />
        </Card>
      ) : send.error ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
          {send.error.message}
        </Text>
      ) : null}

      <HoldButton
        label={kind ? 'Envoyer l’alerte SOS' : 'Choisissez ce qui se passe'}
        hint={kind ? 'Maintenez appuyé pour envoyer' : 'Puis maintenez le bouton appuyé'}
        onConfirm={() =>
          kind &&
          send.mutate(
            { kind, landmark },
            {
              onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
              onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
            }
          )
        }
        disabled={!kind}
        loading={send.isPending}
      />
      <Button label={`Appeler le SAMU · ${SAMU_NUMBER}`} variant="secondary" onPress={callSamu} />
      {FULL_FEATURES ? (
        <Pressable onPress={() => router.push({ pathname: '/emergency-card' })} accessibilityRole="button" style={styles.withdraw}>
          <Text variant="label" tone="brand">
            Ma fiche d’urgence (allergies, contacts)
          </Text>
        </Pressable>
      ) : null}
      <Text variant="caption" tone="subtle" style={styles.center}>
        Votre position précise n’est envoyée qu’au SAMU, pour cette alerte.
      </Text>
    </Animated.View>
  )
}

const STEPS = ['Alerte reçue', 'Ambulance en route', 'Arrivée'] as const

function Tracking({ alert }: { alert: SosAlert }) {
  const { colors } = useTheme()
  const { user } = useAuth()
  const now = useNow(15_000)
  const cancel = useCancelSos()
  const [confirm, setConfirm] = useState(false)

  const step = alert.status === 'pending' ? 0 : alert.status === 'assigned' ? 1 : 2
  const phone = user?.phone_number ? nationalPhone(user.phone_number) : null
  const headline =
    alert.status === 'pending'
      ? 'Alerte reçue par le SAMU'
      : alert.status === 'assigned'
        ? 'Une ambulance arrive'
        : alert.status === 'on_site'
          ? 'L’ambulance est sur place'
          : 'Transport vers l’hôpital'
  const detail =
    alert.status === 'pending'
      ? `Un régulateur va vous rappeler${phone ? ` au ${phone}` : ''}. Gardez votre téléphone près de vous.`
      : alert.ambulance
        ? `${alert.ambulance.ambulance_type_display} ${alert.ambulance.plate_number}${
            alert.status === 'assigned' && alert.eta_at
              ? ` · arrivée ${etaLabel(alert.eta_at, now)}`
              : alert.status === 'assigned' && alert.ambulance.distance_km !== null
                ? ` · à ${formatDistance(alert.ambulance.distance_km)}`
                : ''
          }`
        : 'Les secours sont pris en charge par le SAMU.'

  return (
    <Animated.View entering={FadeIn.duration(motion.base)} style={styles.stack}>
      <Card style={[styles.status, { borderColor: colors.brand }]}>
        <View style={styles.statusHead}>
          <StatusDot color={alert.status === 'pending' ? 'brand' : 'ok'} pulse size={12} />
          <Text variant="eyebrow" tone={alert.status === 'pending' ? 'brand' : 'ok'}>
            {alert.description.replace(/^SOS — /, '')} · envoyée {timeAgo(alert.created_at, now)}
          </Text>
        </View>
        <Text variant="title" accessibilityLiveRegion="polite">
          {headline}
        </Text>
        <Text variant="body" tone="muted">
          {detail}
        </Text>
        <View style={styles.steps} accessibilityLabel={`Étape : ${STEPS[step]}`}>
          {STEPS.map((label, index) => (
            <View key={label} style={styles.step}>
              <View style={[styles.bar, { backgroundColor: index <= step ? colors.ok : colors.line }]} />
              <Text variant="caption" tone={index === step ? 'fg' : 'subtle'}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Button label={`Appeler le SAMU · ${SAMU_NUMBER}`} onPress={callSamu} haptic />

      {(alert.instructions?.length ? alert.instructions : FALLBACK_INSTRUCTIONS).map((item, index) => (
        <Card key={item.code} style={[styles.block, index === 0 && item.code !== 'stay_safe' && { borderColor: colors.brand }]}>
          <Text variant="heading">{item.title}</Text>
          {item.steps.map((step) => (
            <View key={step} style={styles.tip}>
              <Icon name="check" size={16} color="ok" />
              <Text variant="body" style={styles.flex}>
                {step}
              </Text>
            </View>
          ))}
        </Card>
      ))}

      {alert.status === 'pending' ? (
        <Pressable
          onPress={() => {
            if (!confirm) return setConfirm(true)
            setConfirm(false)
            cancel.mutate(alert.id)
          }}
          disabled={cancel.isPending}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.withdraw}
        >
          <Text variant="label" tone={confirm ? 'brand' : 'muted'}>
            {confirm ? 'Toucher à nouveau pour retirer l’alerte' : 'Fausse alerte : retirer mon alerte'}
          </Text>
        </Pressable>
      ) : null}
      {cancel.error ? (
        <Text variant="caption" tone="brand" style={styles.center}>
          {cancel.error.message}
        </Text>
      ) : null}
    </Animated.View>
  )
}

/** « +221771112233 » → « 77 111 22 33 ». */
function nationalPhone(phone: string) {
  const digits = phone.replace(/^\+221/, '')
  return digits.length === 9 ? `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}` : phone
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, gap: space.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  loading: { paddingVertical: space.xxxl },
  stack: { gap: space.lg },
  intro: { gap: space.sm },
  notice: { gap: 2 },
  block: { gap: space.sm },
  kind: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  sos: { height: 64 },
  center: { textAlign: 'center' },
  status: { gap: space.sm },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  steps: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  step: { flex: 1, gap: 4 },
  bar: { height: 4, borderRadius: 2 },
  tip: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  withdraw: { alignSelf: 'center', paddingVertical: space.sm },
})
