import React, { useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { callFacility, openDirections } from '@/features/alerts/format'
import { formatDistance, useDeviceLocation, type Coords } from '@/lib/location'
import { useDonor, useNearbyCenters } from '@/lib/queries'
import { fonts, motion, radius, space, useTheme } from '@/theme'
import type { FacilityType, NearbyFacility } from '@/types/api'

/** Repli quand aucune position n'est connue : centre de Dakar (CNTS, Fann). */
const DAKAR: Coords = { latitude: 14.6928, longitude: -17.4467 }

const FILTERS: { value: FacilityType | null; label: string }[] = [
  { value: null, label: 'Tous' },
  { value: 'blood_bank', label: 'Centres de transfusion' },
  { value: 'hospital', label: 'Hôpitaux' },
  { value: 'health_center', label: 'Centres de santé' },
  { value: 'clinic', label: 'Cliniques' },
]

const TYPE_ICON: Record<FacilityType, IconName> = {
  blood_bank: 'drop',
  hospital: 'hospital',
  health_center: 'hospital',
  clinic: 'hospital',
  ambulance_service: 'pulse',
}

/**
 * Centres : établissements les plus proches (position du téléphone, sinon
 * celle du profil, sinon Dakar), filtrables par type ; appel et itinéraire en
 * un geste.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function CentersScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { data: donor } = useDonor()
  const location = useDeviceLocation()
  const [filter, setFilter] = useState<FacilityType | null>(null)

  const profileCoords = donor?.latitude != null && donor.longitude != null ? { latitude: donor.latitude, longitude: donor.longitude } : null
  const origin = location.coords ?? profileCoords ?? (location.status === 'checking' ? null : DAKAR)
  const usingFallback = origin === DAKAR
  const centers = useNearbyCenters(origin, filter)
  // Les services d'ambulances ne reçoivent pas de donneurs.
  const list = (centers.data ?? []).filter((center) => center.facility_type !== 'ambulance_service')

  return (
    <FlatList
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
      data={list}
      keyExtractor={(item) => String(item.id)}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={centers.isRefetching} onRefresh={() => centers.refetch()} tintColor={colors.muted} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.title}>
            <Icon name="sparkle" size={22} />
            <Text variant="display" accessibilityRole="header">
              Centres
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {usingFallback
              ? 'Autour de Dakar. Partagez votre position pour voir les centres les plus proches de vous.'
              : 'Les plus proches de vous, dans un rayon de 150 km.'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((option) => {
              const active = option.value === filter
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setFilter(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: colors.brand, borderColor: colors.brand }
                      : { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}
                >
                  {active ? <Icon name="check" size={14} color="onBrand" strokeWidth={2.4} /> : null}
                  <Text variant="label" tone={active ? 'onBrand' : 'fg'}>
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
          {usingFallback && location.status !== 'denied' && location.status !== 'unavailable' ? (
            <Pressable
              onPress={() => location.request()}
              accessibilityRole="button"
              style={[styles.locate, { backgroundColor: colors.brandSoft }]}
            >
              <Icon name="location" size={18} color="brand" />
              <Text variant="label" tone="brand">
                Utiliser ma position
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={[styles.empty, { borderColor: colors.line }]}>
          <Text variant="caption" tone={centers.isError ? 'brand' : 'muted'} style={styles.centerText}>
            {centers.isError
              ? 'Impossible de charger les centres. Tirez pour réessayer.'
              : centers.isLoading || !origin
                ? 'Recherche des centres…'
                : 'Aucun établissement de ce type dans le rayon.'}
          </Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      renderItem={({ item, index }) => <CenterRow center={item} index={index} />}
    />
  )
}

function CenterRow({ center, index }: { center: NearbyFacility; index: number }) {
  const { colors } = useTheme()
  const isBloodBank = center.facility_type === 'blood_bank'
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.base).delay(Math.min(index, 8) * 40).easing(motion.easeOut)}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: isBloodBank ? colors.brand : colors.line }]}
    >
      <View style={[styles.typeIcon, { backgroundColor: isBloodBank ? colors.brandSoft : colors.raised }]}>
        <Icon name={TYPE_ICON[center.facility_type]} size={20} color={isBloodBank ? 'brand' : 'muted'} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {center.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {center.facility_type_display} · {center.city}
        </Text>
        <View style={styles.actions}>
          {center.distance_km != null ? (
            <Text variant="caption" numberOfLines={1} style={styles.distance}>
              {formatDistance(center.distance_km)}
            </Text>
          ) : null}
          <View style={styles.spacer} />
          {center.phone_number ? (
            <ActionButton icon="phone" label="Appeler" onPress={() => callFacility(center.phone_number!)} />
          ) : null}
          <ActionButton icon="route" label="Itinéraire" primary onPress={() => openDirections(center)} />
        </View>
      </View>
    </Animated.View>
  )
}

function ActionButton({ icon, label, onPress, primary = false }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.action,
        primary ? { backgroundColor: colors.brand } : { borderColor: colors.line, borderWidth: 1 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Icon name={icon} size={15} color={primary ? 'onBrand' : 'fg'} />
      <Text variant="caption" tone={primary ? 'onBrand' : 'fg'} style={styles.actionLabel}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  header: { gap: space.sm, marginBottom: space.lg },
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  filters: { gap: space.sm, paddingVertical: space.sm, paddingRight: space.xl },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  locate: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  row: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  typeIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  distance: { fontFamily: fonts.semibold, flexShrink: 0 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: space.md, borderRadius: radius.pill },
  actionLabel: { fontFamily: fonts.medium },
  gap: { height: space.sm },
  spacer: { flex: 1 },
  empty: { padding: space.xl, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  centerText: { textAlign: 'center' },
})
