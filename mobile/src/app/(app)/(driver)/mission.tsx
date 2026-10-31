import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useQueryClient } from '@tanstack/react-query'
import { ScreenHeader } from '@/components/ScreenHeader'
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
import { outcome, PRIORITY } from '@/features/mission/format'
import { MissionPanel } from '@/features/mission/MissionPanel'
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
    knownActive.current = id
  }, [missions.data])

  const tracking = useAmbulanceTracking(ambulance.id, active ? 'mission' : ambulance.status === 'available' ? 'standby' : 'off')
  const push = usePushPermission()
  const advance = useAdvanceMission()
  const availability = useSetAvailability()
  const [choosing, setChoosing] = useState(false)

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
  const freshness = live
    ? 'En direct'
    : missions.isError && missions.data
      ? `Hors ligne · ${timeAgo(missions.dataUpdatedAt, now)}`
      : 'Connexion…'

  return (
    <View style={[styles.flex, { backgroundColor: colors.canvas }]}>
      <ScrollView
        contentContainerStyle={styles.content}
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
        <ScreenHeader
          title={active ? 'Mission en cours' : 'En service'}
          meta={
            <>
              <StatusDot color={live ? 'ok' : 'subtle'} pulse={live} />
              <Text variant="caption" tone="muted">
                {freshness}
              </Text>
            </>
          }
          right={active ? null : <LogoutButton />}
        />

        <View style={styles.body}>
          <VehicleCard ambulance={ambulance} />

          {!active && ambulance.status !== 'on_mission' ? (
            <View style={styles.block}>
              <Segmented<'available' | 'out_of_service'>
                label="Disponibilité"
                value={ambulance.status === 'out_of_service' ? 'out_of_service' : 'available'}
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
              {ambulance.status === 'available' ? <ShiftCheckCard ambulanceId={ambulance.id} now={now} /> : null}
            </View>
          ) : null}

          <Readiness
            tracking={tracking.status}
            trackingOn={!!active || ambulance.status === 'available'}
            lastSentAt={tracking.lastSentAt}
            now={now}
            onLocation={() => (tracking.status === 'undetermined' ? tracking.request() : openSettings())}
            push={push.status}
            pushBusy={push.busy}
            onPush={() => (push.status === 'denied' ? openSettings() : push.enable())}
          />

          {missions.isPending ? (
            <ActivityIndicator style={styles.loading} color={colors.muted} />
          ) : active ? (
            <MissionPanel
              key={active.id}
              mission={active}
              now={now}
              busy={advance.isPending && !choosing}
              error={choosing ? null : (advance.error?.message ?? null)}
              onAdvance={(status) => send(status)}
              onChooseDestination={() => {
                advance.reset()
                setChoosing(true)
              }}
            />
          ) : ambulance.status === 'out_of_service' ? (
            <EmptyState
              icon="ambulance"
              title="Ambulance hors service"
              body="Aucune mission ne vous sera confiée. Passez « En service » dès que le véhicule est prêt."
            />
          ) : (
            <Animated.View entering={FadeIn} style={styles.waiting}>
              <View style={[styles.waitingIcon, { borderColor: colors.line, backgroundColor: colors.surface }]}>
                <StatusDot color="ok" pulse size={12} />
              </View>
              <Text variant="heading" style={styles.message}>
                En attente de mission
              </Text>
              <Text variant="body" tone="muted" style={styles.message}>
                La régulation vous confie la prochaine intervention proche de vous. Vous êtes prévenu aussitôt, même
                téléphone verrouillé.
              </Text>
            </Animated.View>
          )}

          {missions.data?.recent.length ? <Recent missions={missions.data.recent} /> : null}
        </View>
      </ScrollView>

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

function VehicleCard({ ambulance }: { ambulance: Ambulance }) {
  const { colors } = useTheme()
  const tone = ambulance.status === 'available' ? 'ok' : ambulance.status === 'on_mission' ? 'warning' : 'subtle'
  return (
    <Card style={styles.vehicle}>
      <View style={[styles.vehicleIcon, { backgroundColor: colors.raised }]}>
        <Icon name="ambulance" size={24} />
      </View>
      <View style={styles.flex}>
        <Text variant="mono">{ambulance.plate_number}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {ambulance.ambulance_type_display} · {ambulance.facility.name}
        </Text>
      </View>
      <View style={styles.vehicleStatus}>
        <StatusDot color={tone} />
        <Text variant="label" tone={tone === 'subtle' ? 'muted' : tone}>
          {ambulance.status_display}
        </Text>
      </View>
    </Card>
  )
}

const LOCATION_STATE: Record<LocationStatus, PermissionState> = {
  checking: 'busy',
  granted: 'done',
  undetermined: 'todo',
  denied: 'blocked',
  unavailable: 'blocked',
}

/** Autorisations indispensables en service : position (régulation) et notifications (missions). */
function Readiness(props: {
  tracking: LocationStatus
  trackingOn: boolean
  lastSentAt: number | null
  now: number
  onLocation: () => void
  push: PushStatus | null
  pushBusy: boolean
  onPush: () => void
}) {
  const { tracking, trackingOn, lastSentAt, now, push } = props
  const needsPush = push === 'undetermined' || push === 'denied'
  if (tracking === 'granted' && !needsPush) {
    if (!trackingOn) return null
    return (
      <View style={styles.shared}>
        <Icon name="location" size={16} color="ok" />
        <Text variant="caption" tone="muted">
          {lastSentAt ? `Position partagée avec la régulation · ${timeAgo(lastSentAt, now)}` : 'Recherche de votre position…'}
        </Text>
      </View>
    )
  }
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
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {outcome(mission)}
              </Text>
            </View>
            <View style={styles.recentMeta}>
              <Text variant="caption" tone={PRIORITY[mission.priority].tone}>
                {PRIORITY[mission.priority].label}
              </Text>
              <Text variant="caption" tone="subtle">
                {formatDate(mission.created_at, { short: true })} · {formatTime(mission.created_at)}
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
  content: { paddingBottom: space.xxxl },
  body: { paddingHorizontal: space.xl, gap: space.xl },
  block: { gap: space.sm },
  loading: { paddingVertical: space.xxl },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  vehicleIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  vehicleStatus: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  shared: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.sm },
  waiting: { alignItems: 'center', gap: space.sm, paddingTop: space.lg },
  waitingIcon: { width: 56, height: 56, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  recent: { paddingVertical: 0 },
  recentRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  recentMeta: { alignItems: 'flex-end', gap: 2 },
  logout: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
})
