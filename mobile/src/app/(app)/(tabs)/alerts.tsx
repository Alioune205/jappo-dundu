import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated'
import { useQueryClient } from '@tanstack/react-query'
import { ScreenHeader } from '@/components/ScreenHeader'
import { StatusDot } from '@/components/ui/StatusDot'
import { Text } from '@/components/ui/Text'
import { EmptyState, Notice, SkeletonList } from '@/features/alerts/AlertStates'
import { pendingCount, sortRequests } from '@/features/alerts/format'
import { RequestCard } from '@/features/alerts/RequestCard'
import { RequestSheet } from '@/features/alerts/RequestSheet'
import { formatDate, timeAgo } from '@/lib/dates'
import { distanceKm, openSettings, useDeviceLocation } from '@/lib/location'
import { QK, useDonor, useNearby, useUpdateDonor } from '@/lib/queries'
import { useAlertStream } from '@/lib/realtime'
import { useNow } from '@/lib/useNow'
import { motion, radius, space, useTheme } from '@/theme'
import type { DonorProfile } from '@/types/api'

/** Écart au-delà duquel la position enregistrée dans le profil est mise à jour (alertes push). */
const PROFILE_MOVE_KM = 2

/**
 * Alertes : demandes compatibles autour du donneur, en temps réel.
 *
 * Données : position du téléphone (sinon celle du profil) → GET nearby ; le
 * flux /ws/alerts/ déclenche un rafraîchissement, un sondage d'une minute
 * prend le relais s'il est coupé ; le cache hors ligne affiche la dernière
 * liste connue dès l'ouverture.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function AlertsScreen() {
  const { data: donor } = useDonor()
  // Garanti par la mise en page des onglets (profil chargé avant l'affichage).
  return donor ? <Alerts donor={donor} /> : null
}

function Alerts({ donor }: { donor: DonorProfile }) {
  const { colors } = useTheme()
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const now = useNow()
  const params = useLocalSearchParams<{ request?: string }>()
  const location = useDeviceLocation()
  const updateDonor = useUpdateDonor()

  const hasProfileLocation = donor.latitude != null && donor.longitude != null
  const canQuery = !!location.coords || hasProfileLocation

  // Une alerte du flux : la liste est relue (regroupé si plusieurs arrivent ensemble).
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onAlert = useCallback(() => {
    if (refreshTimer.current) return
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      queryClient.invalidateQueries({ queryKey: QK.nearby })
    }, 400)
  }, [queryClient])
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

  const stream = useAlertStream(onAlert, canQuery)
  const live = stream === 'live'
  const nearby = useNearby(location.coords, { enabled: canQuery, live })
  const requests = useMemo(() => sortRequests(nearby.data ?? []), [nearby.data])

  // Badge de l'onglet : demandes sans réponse.
  const pending = pendingCount(nearby.data)
  useEffect(() => {
    navigation.setOptions({ tabBarBadge: pending || undefined })
  }, [navigation, pending])

  // Nouvelle demande apparue pendant que l'écran est ouvert : vibration discrète.
  const knownIds = useRef<Set<number> | null>(null)
  useEffect(() => {
    if (!nearby.data) return
    const ids = new Set(nearby.data.map((request) => request.id))
    if (knownIds.current && [...ids].some((id) => !knownIds.current!.has(id))) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    }
    knownIds.current = ids
  }, [nearby.data])

  // Position du profil tenue à jour si le donneur l'a partagée et s'est déplacé.
  const syncedLocation = useRef(false)
  const { mutate: patchDonor } = updateDonor
  useEffect(() => {
    if (syncedLocation.current || !location.coords || !hasProfileLocation) return
    const saved = { latitude: donor.latitude!, longitude: donor.longitude! }
    if (distanceKm(saved, location.coords) < PROFILE_MOVE_KM) return
    syncedLocation.current = true
    patchDonor(location.coords)
  }, [location.coords, hasProfileLocation, donor.latitude, donor.longitude, patchDonor])

  // Demande ouverte : touchée dans la liste, ou arrivée par une notification (?request=).
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const paramId = params.request ? Number(params.request) : null
  const openId = selectedId ?? paramId
  const selected = openId === null ? undefined : (nearby.data?.find((request) => request.id === openId) ?? null)
  // Notification d'une demande pas encore dans la liste : relecture immédiate.
  const { refetch } = nearby
  useEffect(() => {
    if (paramId !== null && canQuery) refetch()
  }, [paramId, canQuery, refetch])

  const closeSheet = () => {
    setSelectedId(null)
    if (params.request) router.setParams({ request: undefined })
  }
  const openRequest = useCallback((id: number) => setSelectedId(id), [])

  const freshness = live
    ? 'En direct'
    : nearby.isError && nearby.data
      ? `Hors ligne · ${timeAgo(nearby.dataUpdatedAt, now)}`
      : nearby.dataUpdatedAt
        ? `Actualisé ${timeAgo(nearby.dataUpdatedAt, now)}`
        : 'Connexion…'

  const header = (
    <ScreenHeader
      title="Alertes"
      meta={
        <>
          <StatusDot color={live ? 'ok' : nearby.isError ? 'warning' : 'subtle'} pulse={live} />
          <Text variant="caption" tone="muted">
            {freshness}
          </Text>
        </>
      }
      right={
        <Pressable
          onPress={() => router.navigate('/profile')}
          accessibilityRole="button"
          accessibilityLabel={donor.is_available ? 'Disponible. Modifier dans le profil' : 'Indisponible. Modifier dans le profil'}
          style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.surface }]}
        >
          <StatusDot color={donor.is_available ? 'ok' : 'subtle'} />
          <Text variant="label" tone={donor.is_available ? 'fg' : 'muted'}>
            {donor.is_available ? 'Disponible' : 'Indisponible'}
          </Text>
        </Pressable>
      }
    />
  )

  const notices = (
    <>
      {!donor.is_available && (
        <Notice
          title="Vous êtes indisponible"
          body="Les hôpitaux ne vous sollicitent pas et vous ne recevez pas d’alerte push."
          action={{ label: 'Me rendre disponible', onPress: () => patchDonor({ is_available: true }), disabled: updateDonor.isPending }}
        />
      )}
      {donor.is_available && !donor.is_eligible && (
        <Notice
          title={donor.next_eligible_date ? `Prochain don possible le ${formatDate(donor.next_eligible_date)}` : 'Don impossible pour l’instant'}
          body={
            donor.next_eligible_date
              ? 'Le délai entre deux dons protège votre santé. Les demandes restent visibles en attendant.'
              : (donor.ineligibility_reasons[0] ?? '')
          }
        />
      )}
    </>
  )

  let empty: React.ReactElement
  if (!canQuery) {
    empty =
      location.status === 'checking' ? (
        <SkeletonList />
      ) : (
        <EmptyState
          icon="pin"
          title="Où êtes-vous ?"
          body="Votre position permet de vous montrer les demandes des hôpitaux proches. Elle reste sur votre téléphone pour ce calcul."
          action={
            location.status === 'denied'
              ? { label: 'Ouvrir les réglages', onPress: openSettings }
              : { label: 'Partager ma position', onPress: location.request, loading: location.locating }
          }
        />
      )
  } else if (nearby.isPending) {
    empty = <SkeletonList />
  } else if (nearby.isError) {
    empty = (
      <EmptyState
        icon="pulse"
        title="Connexion impossible"
        body={nearby.error.message}
        action={{ label: 'Réessayer', onPress: () => nearby.refetch(), loading: nearby.isFetching }}
      />
    )
  } else {
    empty = (
      <EmptyState
        icon="drop"
        title="Aucune demande autour de vous"
        body="Rien à faire pour l’instant. Une alerte vous préviendra dès qu’un hôpital proche aura besoin de votre groupe."
      />
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <FlatList
        data={requests}
        keyExtractor={(request) => String(request.id)}
        ListHeaderComponent={
          <>
            {header}
            <View style={styles.notices}>{notices}</View>
          </>
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.duration(motion.slow).delay(Math.min(index, 5) * motion.stagger).easing(motion.easeOut)}
            layout={LinearTransition.duration(motion.base)}
            style={styles.item}
          >
            <RequestCard request={item} now={now} onPress={openRequest} />
          </Animated.View>
        )}
        ListEmptyComponent={<View style={styles.item}>{empty}</View>}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={nearby.isRefetching && !nearby.isPending}
            onRefresh={() => {
              location.refresh()
              nearby.refetch()
            }}
            tintColor={colors.muted}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface}
          />
        }
        showsVerticalScrollIndicator={false}
      />
      <RequestSheet visible={openId !== null} request={selected} loading={nearby.isFetching} donor={donor} onClose={closeSheet} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: space.xxl },
  notices: { paddingHorizontal: space.xl, gap: space.md, marginBottom: space.md },
  item: { paddingHorizontal: space.xl, marginBottom: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
})
