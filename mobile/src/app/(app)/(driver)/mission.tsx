import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Segmented } from '@/components/ui/Segmented'
import { StatusDot } from '@/components/ui/StatusDot'
import { Text } from '@/components/ui/Text'
import { useAuth } from '@/context/AuthContext'
import { EmptyState } from '@/features/alerts/AlertStates'
import { PermissionCard, type PermissionState } from '@/features/donor/PermissionCard'
import { DestinationSheet } from '@/features/mission/DestinationSheet'
import { CancelledNotice } from '@/features/mission/CancelledNotice'
import { outcome, recentCancellation } from '@/features/mission/format'
import { BilanCard } from '@/features/mission/BilanCard'
import { MissionActions, MissionPanel } from '@/features/mission/MissionPanel'
import { ShiftCheckCard } from '@/features/mission/ShiftCheckCard'
import { formatDate, formatTime, timeAgo } from '@/lib/dates'
import { openSettings, type LocationStatus } from '@/lib/location'
import { isMissingAmbulance, useAdvanceMission, useMyAmbulance, useMyMissions, useSetAvailability, type DriverStep } from '@/lib/missions'
import { usePushPermission, type PushStatus } from '@/lib/push'
import { QK } from '@/lib/queries'
import { useAlertStream } from '@/lib/realtime'
import { useAmbulanceTracking } from '@/lib/tracking'
import { useNow } from '@/lib/useNow'
import { radius, space, useTheme } from '@/theme'
import type { Ambulance, AmbulanceAlertEvent, Mission } from '@/types/api'
import { FULL_FEATURES } from '@/lib/features'

/**
 * Écran de l'ambulancier : son véhicule, la mission que la régulation lui a
 * confiée, et sa position partagée tant qu'il est en service.
 *
 * Données : GET vehicles/mine/ puis missions/ ; le flux /ws/alerts/ déclenche
 * une relecture dès qu'un événement concerne son ambulance (affectation,
 * annulation), un sondage de 20 s prend le relais s'il est coupé.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function MissionScreen() {
  const { colors } = useTheme()
  const ambulance = useMyAmbulance()

  if (ambulance.data) return <DriverHome ambulance={ambulance.data} />

  return (
    <View style={[styles.center, { backgroundColor: colors.canvas }]}>
      {isMissingAmbulance(ambulance.error) ? (
        <>
          <EmptyState
            icon="ambulance"
            title="Aucune ambulance affectée"
            body="Votre compte ambulancier n’est rattaché à aucun véhicule. Demandez à la régulation de vous affecter une ambulance."
            action={{ label: 'Actualiser', onPress: () => ambulance.refetch(), loading: ambulance.isFetching }}
          />
          <LogoutLink />
        </>
      ) : ambulance.isError ? (
        <>
          <Text variant="heading">Connexion impossible</Text>
          <Text variant="body" tone="muted" style={styles.message}>
            {ambulance.error.message}
          </Text>
          <Button label="Réessayer" variant="secondary" onPress={() => ambulance.refetch()} style={styles.retry} />
        </>
      ) : (
        <ActivityIndicator color={colors.muted} />
      )}
    </View>
  )
}

function DriverHome({ ambulance }: { ambulance: Ambulance }) {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const now = useNow()

  // Événement du flux concernant cette ambulance : mission et véhicule relus (regroupés).
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onAlert = useCallback(
    (event: AmbulanceAlertEvent) => {
      if (event.data.ambulance?.id !== ambulance.id || refreshTimer.current) return
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null
        queryClient.invalidateQueries({ queryKey: QK.missions })
        queryClient.invalidateQueries({ queryKey: QK.ambulance })
      }, 300)
    },
    [ambulance.id, queryClient]
  )
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

  const stream = useAlertStream(onAlert, true, 'ambulance_alert')
  const live = stream === 'live'
  const missions = useMyMissions({ enabled: true, live })
  const active = missions.data?.active ?? null

  // Nouvelle mission arrivée écran ouvert : vibration franche.
  const knownActive = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (!missions.data) return
    const id = missions.data.active?.id ?? null
    if (knownActive.current !== undefined && id !== null && id !== knownActive.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    }
    // Mission suivie puis disparue et annulée : vibration d'alerte (le bandeau explique pourquoi).
    if (knownActive.current && id === null && missions.data.recent[0]?.status === 'cancelled') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
    knownActive.current = id
  }, [missions.data])

  const tracking = useAmbulanceTracking(ambulance.id, active ? 'mission' : ambulance.status === 'available' ? 'standby' : 'off')
  const push = usePushPermission()
  const advance = useAdvanceMission()
  const availability = useSetAvailability()
  const [choosing, setChoosing] = useState(false)
  const [readCancel, setReadCancel] = useState<number | null>(null)
  const cancelled = recentCancellation(missions.data?.recent ?? [], now)

  const send = (status: DriverStep, destinationId?: number) => {
    if (!active) return
    advance.mutate(
      { id: active.id, status, destinationId },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          setChoosing(false)
        },
        onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      }
    )
  }

  const refreshing = missions.isRefetching && !missions.isPending
  const insets = useSafeAreaInsets()
  const freshness = live
    ? 'En direct'
    : missions.isError && missions.data
      ? `Hors ligne · ${timeAgo(missions.dataUpdatedAt, now)}`
      : 'Connexion…'
  const chooseDestination = () => {
    advance.reset()
    setChoosing(true)
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              missions.refetch()
              queryClient.invalidateQueries({ queryKey: QK.ambulance })
            }}
            tintColor={colors.muted}
          />
        }
      >
        <View style={styles.body}>
          <Header ambulance={ambulance} freshness={freshness} live={live} showLogout={!active} />

          {missions.isPending ? (
            <ActivityIndicator style={styles.loading} color={colors.muted} />
          ) : active ? (
            <>
              <MissionPanel key={active.id} mission={active} now={now} onChooseDestination={chooseDestination} />
              {tracking.status === 'granted' ? <SharedPosition at={tracking.lastSentAt} now={now} /> : null}
              {FULL_FEATURES && (active.status === 'on_site' || active.status === 'transporting') ? <BilanCard mission={active} now={now} /> : null}
            </>
          ) : (
            <>
              {cancelled && readCancel !== cancelled.id ? (
                <CancelledNotice mission={cancelled} now={now} onDismiss={() => setReadCancel(cancelled.id)} />
              ) : null}
              <Standby
              ambulance={ambulance}
              availability={availability}
              now={now}
              sharedAt={tracking.status === 'granted' ? tracking.lastSentAt : undefined}
            />
            </>
          )}

          <Readiness
            tracking={tracking.status}
            onLocation={() => (tracking.status === 'undetermined' ? tracking.request() : openSettings())}
            push={push.status}
            pushBusy={push.busy}
            onPush={() => (push.status === 'denied' ? openSettings() : push.enable())}
          />

          {!active && missions.data?.recent.length ? <Recent missions={missions.data.recent.slice(0, 3)} /> : null}
        </View>
      </ScrollView>

      {active ? (
        <View style={[styles.footer, { backgroundColor: colors.canvas, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <MissionActions
            mission={active}
            busy={advance.isPending && !choosing}
            error={choosing ? null : (advance.error?.message ?? null)}
            onAdvance={(status) => send(status)}
            onChooseDestination={chooseDestination}
          />
        </View>
      ) : null}

      <DestinationSheet
        missionId={active?.id ?? null}
        visible={choosing && !!active}
        busy={advance.isPending}
        error={choosing ? (advance.error?.message ?? null) : null}
        onPick={(facility) => send('transporting', facility.id)}
        onClose={() => setChoosing(false)}
      />
    </View>
  )
}

/** En-tête discret : le véhicule à gauche, l'état de la connexion (et la sortie, hors mission) à droite. */
function Header({ ambulance, freshness, live, showLogout }: { ambulance: Ambulance; freshness: string; live: boolean; showLogout: boolean }) {
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Text variant="heading" style={styles.plate}>
          {ambulance.plate_number}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {ambulance.ambulance_type_display} · {ambulance.facility.name}
        </Text>
      </View>
      <View style={styles.live}>
        <StatusDot color={live ? 'ok' : 'subtle'} pulse={live} />
        <Text variant="caption" tone="muted">
          {freshness}
        </Text>
      </View>
      {showLogout ? <LogoutButton /> : null}
    </View>
  )
}

/** Preuve discrète que la régulation voit le véhicule : heure du dernier envoi de position. */
function SharedPosition({ at, now }: { at: number | null; now: number }) {
  return (
    <View style={styles.shared}>
      <Icon name="location" size={16} color="ok" />
      <Text variant="caption" tone="muted">
        {at ? `Position partagée avec la régulation · ${timeAgo(at, now)}` : 'Recherche de votre position…'}
      </Text>
    </View>
  )
}

/** Hors mission : un grand état lisible d'un coup d'œil, et l'interrupteur de disponibilité. */
function Standby({
  ambulance,
  availability,
  now,
  sharedAt,
}: {
  ambulance: Ambulance
  availability: ReturnType<typeof useSetAvailability>
  now: number
  sharedAt?: number | null
}) {
  const { colors } = useTheme()
  const out = ambulance.status === 'out_of_service'
  return (
    <View style={styles.standby}>
      <Animated.View entering={FadeIn} style={styles.waiting}>
        <View style={[styles.waitingIcon, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          {out ? <Icon name="ambulance" size={26} color="muted" /> : <StatusDot color="ok" pulse size={14} />}
        </View>
        <Text variant="title" style={styles.message}>
          {out ? 'Hors service' : 'En attente de mission'}
        </Text>
        <Text variant="body" tone="muted" style={styles.message}>
          {out
            ? 'Aucune mission ne vous sera confiée. Passez « En service » dès que le véhicule est prêt.'
            : 'La régulation vous confie la prochaine intervention proche de vous. Vous êtes prévenu aussitôt, même téléphone verrouillé.'}
        </Text>
        {!out && sharedAt !== undefined ? <SharedPosition at={sharedAt} now={now} /> : null}
      </Animated.View>

      {ambulance.status !== 'on_mission' ? (
        <View style={styles.block}>
          <Segmented<'available' | 'out_of_service'>
            label="Disponibilité"
            value={out ? 'out_of_service' : 'available'}
            options={[
              { value: 'available', label: 'En service' },
              { value: 'out_of_service', label: 'Hors service' },
            ]}
            onChange={(status) => {
              if (status !== ambulance.status) availability.mutate({ id: ambulance.id, status })
            }}
          />
          {availability.error ? (
            <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
              {availability.error.message}
            </Text>
          ) : null}
          {FULL_FEATURES && ambulance.status === 'available' ? <ShiftCheckCard ambulanceId={ambulance.id} now={now} /> : null}
        </View>
      ) : null}
    </View>
  )
}

const LOCATION_STATE: Record<LocationStatus, PermissionState> = {
  checking: 'busy',
  granted: 'done',
  undetermined: 'todo',
  denied: 'blocked',
  unavailable: 'blocked',
}

/** Autorisations indispensables en service : position (régulation) et notifications (missions). N'apparaît que si l'une manque. */
function Readiness(props: {
  tracking: LocationStatus
  onLocation: () => void
  push: PushStatus | null
  pushBusy: boolean
  onPush: () => void
}) {
  const { tracking, push } = props
  const needsPush = push === 'undetermined' || push === 'denied'
  if (tracking === 'granted' && !needsPush) return null
  return (
    <View style={styles.block}>
      {tracking !== 'granted' && tracking !== 'checking' ? (
        <PermissionCard
          icon="location"
          title="Partager la position de l’ambulance"
          body="La régulation vous affecte les interventions les plus proches et suit votre trajet. Partage uniquement application ouverte."
          state={LOCATION_STATE[tracking]}
          actionLabel="Autoriser"
          doneLabel="Position partagée"
          blockedLabel={tracking === 'unavailable' ? 'Activer la localisation' : 'Ouvrir les réglages'}
          onAction={props.onLocation}
        />
      ) : null}
      {needsPush ? (
        <PermissionCard
          icon="bell"
          title="Alertes de mission"
          body="Soyez prévenu d’une nouvelle intervention même téléphone verrouillé."
          state={props.pushBusy ? 'busy' : push === 'denied' ? 'blocked' : 'todo'}
          actionLabel="Activer"
          doneLabel="Alertes activées"
          onAction={props.onPush}
        />
      ) : null}
    </View>
  )
}

function Recent({ missions }: { missions: Mission[] }) {
  const { colors } = useTheme()
  return (
    <View style={styles.block}>
      <Text variant="eyebrow" tone="muted">
        Dernières missions
      </Text>
      <Card style={styles.recent}>
        {missions.map((mission, index) => (
          <View key={mission.id} style={[styles.recentRow, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {mission.pickup_address || mission.description || `Mission n° ${mission.id}`}
              </Text>
              <Text variant="caption" tone="muted">
                {outcome(mission)}
              </Text>
            </View>
            <View style={styles.recentMeta}>
              <Text variant="caption" tone="subtle">
                {formatDate(mission.created_at, { short: true })}
              </Text>
              <Text variant="caption" tone="subtle">
                {formatTime(mission.created_at)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  )
}

/** Déconnexion en deux touchers (jamais pendant une mission : le bouton est alors masqué). */
function LogoutButton() {
  const { logout } = useAuth()
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  return (
    <Pressable
      onPress={async () => {
        if (!confirm) return setConfirm(true)
        await logout()
        router.replace('/login')
      }}
      accessibilityRole="button"
      accessibilityLabel={confirm ? 'Confirmer la déconnexion' : 'Se déconnecter'}
      hitSlop={8}
      style={styles.logout}
    >
      {confirm ? (
        <Text variant="label" tone="brand">
          Se déconnecter ?
        </Text>
      ) : (
        <Icon name="logout" size={22} color="muted" />
      )}
    </Pressable>
  )
}

function LogoutLink() {
  const { logout } = useAuth()
  const router = useRouter()
  return (
    <Button
      label="Se déconnecter"
      variant="ghost"
      onPress={async () => {
        await logout()
        router.replace('/login')
      }}
      style={styles.retry}
    />
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  message: { textAlign: 'center' },
  retry: { marginTop: space.md, alignSelf: 'stretch' },
  content: { paddingBottom: space.xxl },
  body: { paddingHorizontal: space.xl, gap: space.xl },
  block: { gap: space.sm },
  loading: { paddingVertical: space.xxl },
  shared: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  waiting: { alignItems: 'center', gap: space.sm, paddingTop: space.xl },
  standby: { gap: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  plate: { fontFamily: 'IBMPlexMono_500Medium', letterSpacing: 0.4 },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  waitingIcon: { width: 56, height: 56, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  recent: { paddingVertical: 0 },
  recentRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  recentMeta: { alignItems: 'flex-end', gap: 2 },
  logout: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
})
