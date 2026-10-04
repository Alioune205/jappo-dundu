import React, { useEffect, useMemo } from 'react'
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
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

const STATUS: Record<ResponseStatus, { label: string; icon: IconName; color: keyof Palette }> = {
  donated: { label: 'Don effectué', icon: 'drop', color: 'brand' },
  accepted: { label: 'Venue annoncée', icon: 'check', color: 'ok' },
  declined: { label: 'Demande déclinée', icon: 'close', color: 'subtle' },
  cancelled: { label: 'Venue annulée', icon: 'close', color: 'subtle' },
  no_show: { label: 'Absence signalée', icon: 'clock', color: 'warning' },
}

/**
 * Historique : bilan des dons, délai avant le prochain, puis la frise des
 * dons et des réponses, mois par mois.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function HistoryScreen() {
  const { colors } = useTheme()
  const { data: donor } = useDonor()
  const history = useHistory()
  const sections = useMemo(() => (history.data ? buildTimeline(history.data) : []), [history.data])
  const donationCount = history.data?.donations.length

  return (
    <SectionList
      style={{ backgroundColor: colors.canvas }}
      sections={sections}
      keyExtractor={(item) => item.key}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <>
          <ScreenHeader title="Historique" />
          {donor ? (
            <View style={styles.pad}>
              <Summary donor={donor} donations={donationCount} />
            </View>
          ) : null}
        </>
      }
      renderSectionHeader={({ section }) => (
        <Text variant="eyebrow" tone="subtle" style={styles.section}>
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
              body="Vos dons et vos réponses aux demandes des hôpitaux apparaîtront sur cette frise."
            />
          )}
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={history.isRefetching && !history.isPending}
          onRefresh={() => history.refetch()}
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
    : `Prochain don le ${formatDate(donor.next_eligible_date, { short: true })}`
  const detail = ready
    ? donor.last_donation_date
      ? `Dernier don le ${formatDate(donor.last_donation_date)}.`
      : 'Aucun don enregistré pour l’instant.'
    : `Dans ${days} jour${days! > 1 ? 's' : ''} : le temps que votre organisme reconstitue ses réserves.`

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).easing(motion.easeOut)}>
      <Card style={styles.summary}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.count} accessibilityLabel={`${donations ?? 0} dons enregistrés`}>
              {donations ?? '—'}
            </Text>
            <Text variant="caption" tone="muted">
              {donations === 1 ? 'don enregistré' : 'dons enregistrés'}
            </Text>
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
          <Icon name={status.icon} size={16} color={status.color} strokeWidth={2} />
        </View>
        {!last && <View style={[styles.line, { backgroundColor: colors.line }]} />}
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          <Text variant="bodyStrong" tone={donation ? 'fg' : 'muted'} style={styles.flex}>
            {status.label}
          </Text>
          <Text variant="mono" tone="subtle">
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
  pad: { paddingHorizontal: space.xl },
  flex: { flex: 1 },
  section: { paddingHorizontal: space.xl, marginTop: space.xl, marginBottom: space.md },
  summary: { gap: space.lg },
  summaryTop: { flexDirection: 'row', gap: space.xl, alignItems: 'center' },
  summaryText: { flex: 1, gap: 2 },
  count: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl },
  rail: { alignItems: 'center', width: 32 },
  node: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  line: { width: 1, flex: 1, minHeight: 12 },
  rowText: { flex: 1, gap: 2, paddingTop: 5, paddingBottom: space.lg },
  rowTitle: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
})
