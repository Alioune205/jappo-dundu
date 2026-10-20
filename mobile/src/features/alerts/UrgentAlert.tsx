import React, { useEffect } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated'
import { formatGroup, spokenGroup } from '@/components/ui/BloodGroup'
import { Icon } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { deadline } from '@/lib/dates'
import { formatDistance } from '@/lib/location'
import { fonts, motion, radius, space, useTheme } from '@/theme'
import type { NearbyRequest, Urgency } from '@/types/api'
import { units } from './format'

/** Titre du bandeau selon la gravité. */
export const ALERT_TITLE: Record<Urgency, string> = {
  critical: 'Urgence vitale',
  urgent: 'Demande urgente',
  normal: 'Demande de sang',
}

const RANK: Record<Urgency, number> = { critical: 0, urgent: 1, normal: 2 }

/**
 * Demande à présenter en alerte : sans réponse du donneur, pas encore écartée
 * (« Plus tard ») ; la plus grave d'abord, puis la plus proche (ordre serveur).
 */
export function pickAlert(requests: readonly NearbyRequest[] | undefined, dismissed: ReadonlySet<number>) {
  return (requests ?? [])
    .map((request, index) => ({ request, index }))
    .filter(({ request }) => !request.my_response && !dismissed.has(request.id))
    .sort((a, b) => RANK[a.request.urgency] - RANK[b.request.urgency] || a.index - b.index)[0]?.request
}

/** Ce que l'hôpital attend : immédiat si critique, sinon l'échéance ou la quantité. */
export function needLabel(request: NearbyRequest, now = new Date()) {
  if (request.urgency === 'critical') return 'Besoin immédiat'
  if (request.needed_by) return deadline(request.needed_by, now).replace(/^a/, 'A')
  return `${units(request.units_remaining)} à collecter`
}

interface UrgentAlertProps {
  request: NearbyRequest | undefined
  /** Le donneur peut donner : le bouton principal vaut acceptation. */
  canDonate: boolean
  busy: boolean
  onGo: (request: NearbyRequest) => void
  onLater: (request: NearbyRequest) => void
}

/**
 * Alerte plein écran d'une demande de sang : bandeau rouge, établissement,
 * groupe requis en grand, un seul geste pour s'engager (« J'y vais
 * maintenant »). « Plus tard » l'écarte sans répondre : elle reste dans
 * l'écran Alertes.
 */
export function UrgentAlert({ request, canDonate, busy, onGo, onLater }: UrgentAlertProps) {
  const { colors } = useTheme()
  if (!request) return null

  const place = [request.facility.city, formatDistance(request.distance_km)].filter(Boolean).join(' • ')
  const title = ALERT_TITLE[request.urgency]

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onLater(request)} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(motion.base)} style={styles.backdrop}>
        <Animated.View
          key={request.id}
          entering={ZoomIn.duration(motion.slow).easing(motion.easeOut)}
          accessibilityViewIsModal
          accessibilityLabel={`${title}, ${request.facility.name}, groupe ${spokenGroup(request.blood_group)}`}
          style={[styles.card, { backgroundColor: colors.surface }]}
        >
          <View style={styles.banner}>
            <PulsingIcon />
            <Text style={styles.bannerTitle} accessibilityRole="header">
              {title.toUpperCase()}
            </Text>
          </View>

          <View style={styles.body}>
            <View style={styles.facility}>
              <Text variant="title" style={styles.center} numberOfLines={2}>
                {request.facility.name}
              </Text>
              {place ? (
                <View style={styles.place}>
                  <Icon name="pin" size={16} color="muted" />
                  <Text variant="body" tone="muted">
                    {place}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.group, { borderColor: 'rgba(228, 21, 30, 0.25)', backgroundColor: colors.brandSoft }]}>
              <View style={styles.groupText}>
                <Text variant="eyebrow" tone="muted">
                  Groupe requis
                </Text>
                <Text variant="label" tone="brand">
                  {needLabel(request)}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: 'rgba(228, 21, 30, 0.25)' }]} />
              <Text tone="brand" style={styles.groupValue} accessibilityLabel={`Groupe ${spokenGroup(request.blood_group)}`}>
                {formatGroup(request.blood_group)}
              </Text>
            </View>

            <Pressable
              onPress={() => onGo(request)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={canDonate ? 'J’y vais maintenant' : 'Voir la demande'}
              style={({ pressed }) => [styles.go, { opacity: pressed || busy ? 0.85 : 1 }]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.goLabel}>{canDonate ? 'J’Y VAIS MAINTENANT' : 'VOIR LA DEMANDE'}</Text>
                  <Icon name="arrow" size={20} color="onBrand" strokeWidth={2.2} />
                </>
              )}
            </Pressable>

            <Pressable onPress={() => onLater(request)} accessibilityRole="button" hitSlop={10} style={styles.later}>
              <Text variant="label" tone="muted">
                Plus tard
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

/** Pictogramme d'alerte dans un halo qui bat doucement. */
function PulsingIcon() {
  const beat = useSharedValue(0)
  useEffect(() => {
    beat.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1))
  }, [beat])
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + beat.value * 0.08 }] }))
  return (
    <Animated.View style={[styles.halo, halo]}>
      <Icon name="alert" size={34} color="onBrand" strokeWidth={2.2} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 12, 15, 0.62)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  banner: { alignItems: 'center', gap: space.lg, paddingTop: space.xxl, paddingBottom: space.xl, backgroundColor: '#C8101A' },
  halo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, letterSpacing: 1.2, color: '#FFFFFF' },
  body: { padding: space.xl, gap: space.xl },
  facility: { alignItems: 'center', gap: space.xs },
  place: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  center: { textAlign: 'center' },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg + 4,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    gap: space.lg,
  },
  groupText: { flex: 1, gap: 2 },
  divider: { width: 1, alignSelf: 'stretch' },
  groupValue: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 48, letterSpacing: -0.5, minWidth: 64, textAlign: 'center' },
  go: {
    height: 58,
    borderRadius: radius.lg + 2,
    backgroundColor: '#B0060D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    shadowColor: '#B0060D',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  goLabel: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: 1, color: '#FFFFFF' },
  later: { alignSelf: 'center', marginTop: -space.sm, paddingVertical: space.xs },
})
