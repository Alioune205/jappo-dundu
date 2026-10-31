import React, { useEffect, useMemo } from 'react'
import {
  Image,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Card } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { EmptyState, SkeletonList } from '@/features/alerts/AlertStates'
import { buildTimeline, recoveryProgress, type TimelineItem } from '@/features/history/timeline'
import { daysUntil, formatDate } from '@/lib/dates'
import { useDonor, useHistory } from '@/lib/queries'
import { fonts, motion, radius, space, useTheme, type Palette } from '@/theme'
import type { DonorProfile, ResponseStatus } from '@/types/api'

const HISTORY_HERO = require('../../../../assets/history_hero.jpg')

const STATUS: Record<ResponseStatus, { label: string; icon: IconName; color: keyof Palette }> = {
  donated: { label: 'Don effectué', icon: 'drop', color: 'brand' },
  accepted: { label: 'Venue annoncée', icon: 'check', color: 'ok' },
  declined: { label: 'Demande déclinée', icon: 'close', color: 'subtle' },
  cancelled: { label: 'Venue annulée', icon: 'close', color: 'subtle' },
  no_show: { label: 'Absence signalée', icon: 'clock', color: 'warning' },
}

/**
 * Historique : bilan des dons, délai avant le prochain don,
 * et chronologie mois par mois des dons et réponses.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function HistoryScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const { data: donor } = useDonor()
  const history = useHistory()
  const sections = useMemo(() => (history.data ? buildTimeline(history.data) : []), [history.data])
  const donationCount = history.data?.donations.length ?? 0
  const livesSaved = donationCount * 3

  return (
    <SectionList
      style={{ backgroundColor: colors.canvas }}
      sections={sections}
      keyExtractor={(item) => item.key}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          <ScreenHeader title="Historique" />

          {/* Petite bannière pleine largeur avec image panoramique */}
          <Animated.View entering={FadeInDown.duration(motion.slow).easing(motion.easeOut)} style={styles.pad}>
            <View style={[styles.wideBannerCard, { borderColor: colors.line }]}>
              <Image source={HISTORY_HERO} style={styles.wideBannerImage} resizeMode="cover" />
              <View style={styles.wideBannerOverlay}>
                <View style={[styles.miniBadge, { backgroundColor: colors.brand }]}>
                  <Text style={styles.miniBadgeText}>PARCOURS CITOYEN · CNTS</Text>
                </View>
                <Text style={styles.wideBannerTitle} numberOfLines={1}>
                  Bilan & impact de vos dons
                </Text>
                <Text style={styles.wideBannerSubtitle} numberOfLines={1}>
                  Chaque don sauve jusqu’à 3 vies au Sénégal
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* 3 Métriques d'impact discrètes */}
          <View style={[styles.pad, styles.metricsGrid]}>
            <View style={[styles.metricItem, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Icon name="drop" size={15} color="brand" />
              <Text style={[styles.metricNumber, { color: colors.brand }]}>{donationCount}</Text>
              <Text variant="caption" tone="muted" style={styles.metricLabel}>
                {donationCount <= 1 ? 'Don validé' : 'Dons validés'}
              </Text>
            </View>

            <View style={[styles.metricItem, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Icon name="heart" size={15} color="ok" />
              <Text style={[styles.metricNumber, { color: colors.ok }]}>{livesSaved}</Text>
              <Text variant="caption" tone="muted" style={styles.metricLabel}>
                {livesSaved <= 1 ? 'Vie protégée' : 'Vies protégées'}
              </Text>
            </View>

            <Pressable
              onPress={() => router.navigate('/badges')}
              accessibilityRole="button"
              accessibilityLabel="Voir mes badges et distinctions"
              style={({ pressed }) => [
                styles.metricItem,
                { backgroundColor: colors.surface, borderColor: colors.line, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Icon name="award" size={15} color="brand" />
              <Text style={[styles.metricNumber, { color: colors.fg }]}>Badges</Text>
              <Text variant="caption" tone="brand" style={styles.metricLabel}>
                Distinctions →
              </Text>
            </Pressable>
          </View>

          {/* Jauge d'aptitude médicale & récupération */}
          {donor ? (
            <View style={styles.pad}>
              <Summary donor={donor} donations={donationCount} />
            </View>
          ) : null}

          {/* Titre de section Frise */}
          {sections.length > 0 && (
            <View style={styles.pad}>
              <Text variant="eyebrow" tone="subtle" style={styles.timelineHeader}>
                CHRONOLOGIE DE VOS DONS ET RÉPONSES
              </Text>
            </View>
          )}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text variant="eyebrow" tone="subtle" style={styles.sectionTitle}>
          {section.title}
        </Text>
      )}
      renderItem={({ item, index, section }) => <Row item={item} last={index === section.data.length - 1} />}
      ListEmptyComponent={
        <View style={styles.pad}>
          {history.isPending ? (
            <SkeletonList count={2} />
          ) : history.isError ? (
            <EmptyState
              icon="clock"
              title="Historique indisponible"
              body={history.error.message}
              action={{ label: 'Réessayer', onPress: () => history.refetch(), loading: history.isFetching }}
            />
          ) : (
            <EmptyState
              icon="drop"
              title="Votre histoire commence ici"
              body="Vos dons enregistrés et vos participations aux journées de collecte s’inscriront sur cette frise d’honneur."
              action={{ label: 'Voir les journées de don', onPress: () => router.navigate('/centers') }}
            />
          )}
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={history.isRefetching && !history.isPending}
          onRefresh={() => void history.refetch()}
          tintColor={colors.muted}
          colors={[colors.brand]}
          progressBackgroundColor={colors.surface}
        />
      }
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    />
  )
}

function Summary({ donor, donations }: { donor: DonorProfile; donations: number | undefined }) {
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const target = recoveryProgress(donor.last_donation_date, donor.next_eligible_date)
  const fill = useSharedValue(reduceMotion ? target : 0)

  // La jauge se remplit à l'arrivée : on lit le temps de récupération, pas seulement une date.
  useEffect(() => {
    fill.set(reduceMotion ? target : withDelay(200, withTiming(target, { duration: 900, easing: motion.easeOut })))
  }, [fill, target, reduceMotion])
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))

  const days = donor.next_eligible_date ? daysUntil(donor.next_eligible_date) : null
  const ready = donor.is_eligible || days === null || days <= 0
  const headline = ready
    ? 'Vous pouvez donner'
    : `Prochain don possible le ${formatDate(donor.next_eligible_date, { short: true })}`
  const detail = ready
    ? donor.last_donation_date
      ? `Dernier don effectué le ${formatDate(donor.last_donation_date)}.`
      : 'Aucun délai actif : vous êtes apte pour un premier don.'
    : `Dans ${days} jour${days! > 1 ? 's' : ''} : temps nécessaire pour reconstituer vos réserves sanguines.`

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).easing(motion.easeOut)}>
      <Card style={styles.summary}>
        <View style={styles.summaryTop}>
          <View style={[styles.statusIconBubble, { backgroundColor: ready ? 'rgba(6, 118, 71, 0.12)' : colors.raised }]}>
            <Icon name={ready ? 'check' : 'clock'} size={22} color={ready ? 'ok' : 'muted'} />
          </View>
          <View style={styles.summaryText}>
            <Text variant="bodyStrong" tone={ready ? 'ok' : 'fg'}>
              {headline}
            </Text>
            <Text variant="caption" tone="muted">
              {detail}
            </Text>
          </View>
        </View>
        <View
          style={[styles.track, { backgroundColor: colors.raised }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
          accessibilityLabel="Récupération avant le prochain don"
        >
          <Animated.View style={[styles.fill, { backgroundColor: ready ? colors.ok : colors.brand }, fillStyle]} />
        </View>
      </Card>
    </Animated.View>
  )
}

function Row({ item, last }: { item: TimelineItem; last: boolean }) {
  const { colors } = useTheme()
  const status = STATUS[item.status]
  const donation = item.kind === 'donation'
  return (
    <View style={styles.row} accessible accessibilityLabel={`${status.label}, ${item.facility.name}, ${formatDate(item.date)}`}>
      <View style={styles.rail}>
        <View
          style={[
            styles.node,
            { backgroundColor: donation ? colors.brandSoft : colors.surface, borderColor: donation ? colors.brand : colors.line },
          ]}
        >
          <Icon name={status.icon} size={15} color={status.color} strokeWidth={2} />
        </View>
        {!last && <View style={[styles.line, { backgroundColor: colors.line }]} />}
      </View>
      <View style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.rowTitle}>
          <Text variant="bodyStrong" tone={donation ? 'brand' : 'fg'} style={styles.flex}>
            {status.label}
          </Text>
          <Text variant="mono" tone="subtle" style={styles.dateText}>
            {formatDate(item.date, { short: true })}
          </Text>
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {item.facility.name} · {item.facility.city}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxl },
  headerWrap: { gap: space.md, marginBottom: space.sm },
  pad: { paddingHorizontal: space.xl },
  flex: { flex: 1 },
  wideBannerCard: {
    height: 125,
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
  },
  wideBannerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  wideBannerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: space.md,
    justifyContent: 'flex-end',
    gap: 3,
  },
  wideBannerTitle: {
    color: '#ffffff',
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  wideBannerSubtitle: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  miniBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginBottom: 2,
  },
  miniBadgeText: {
    color: '#ffffff',
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: space.sm,
  },
  metricItem: {
    flex: 1,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricNumber: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 20,
  },
  metricLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  summary: { gap: space.md, padding: space.lg },
  summaryTop: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  statusIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: { flex: 1, gap: 2 },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill },
  timelineHeader: {
    marginTop: space.sm,
    letterSpacing: 1,
  },
  sectionTitle: {
    paddingHorizontal: space.xl,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, marginBottom: space.sm },
  rail: { alignItems: 'center', width: 32 },
  node: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  line: { width: 1.5, flex: 1, minHeight: 14, marginVertical: 2 },
  rowCard: {
    flex: 1,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 3,
  },
  rowTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  dateText: { fontSize: 12 },
})
