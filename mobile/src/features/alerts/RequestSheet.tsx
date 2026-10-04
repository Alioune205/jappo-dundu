import React, { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { BloodGroupBadge } from '@/components/ui/BloodGroup'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Sheet } from '@/components/ui/Sheet'
import { StatusDot } from '@/components/ui/StatusDot'
import { Text } from '@/components/ui/Text'
import { deadline, formatDate, timeAgo } from '@/lib/dates'
import { formatDistance } from '@/lib/location'
import { useRespond } from '@/lib/queries'
import { motion, radius, space, useTheme } from '@/theme'
import type { DonorProfile, NearbyRequest } from '@/types/api'
import { callFacility, openDirections, units, URGENCY } from './format'

interface RequestSheetProps {
  /** Demande affichée ; `null` : introuvable (clôturée ou hors de portée). */
  request: NearbyRequest | null | undefined
  visible: boolean
  loading: boolean
  donor: DonorProfile
  onClose: () => void
}

/**
 * Détail d'une demande et réponse du donneur.
 *
 * Accepter est un engagement à se déplacer : le bouton dit ce qu'il fait
 * (« Je viens donner »), et la confirmation donne aussitôt l'itinéraire, le
 * téléphone et les consignes. Se désister demande un second toucher.
 */
export function RequestSheet({ request, visible, loading, donor, onClose }: RequestSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} label="Détail de la demande">
      {request ? (
        <SheetBody key={request.id} request={request} donor={donor} />
      ) : (
        <View style={styles.missing}>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <>
              <Text variant="heading">Demande indisponible</Text>
              <Text variant="body" tone="muted" style={styles.center}>
                Elle a été satisfaite, annulée, ou n’est plus à votre portée. Merci de votre attention.
              </Text>
            </>
          )}
          <Button label="Fermer" variant="secondary" onPress={onClose} style={styles.stretch} />
        </View>
      )}
    </Sheet>
  )
}

function SheetBody({ request, donor }: { request: NearbyRequest; donor: DonorProfile }) {
  const { colors } = useTheme()
  const respond = useRespond()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const urgency = URGENCY[request.urgency]
  const status = request.my_response
  const accepted = status === 'accepted'
  const { facility } = request

  const send = (next: 'accepted' | 'declined' | 'cancelled') => {
    respond.mutate(
      { id: request.id, status: next },
      {
        onSuccess: () => {
          if (next === 'accepted') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        },
        onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      }
    )
    setConfirmCancel(false)
  }

  const facts: { label: string; value: string }[] = [
    { label: 'Distance', value: formatDistance(request.distance_km) ?? '—' },
    { label: 'À collecter', value: units(request.units_remaining) },
    request.needed_by
      ? { label: 'Échéance', value: deadline(request.needed_by).replace(/^avant /, '') }
      : { label: 'Publiée', value: timeAgo(request.created_at) },
  ]

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        <BloodGroupBadge group={request.blood_group} size={64} />
        <View style={styles.headText}>
          <Text variant="eyebrow" tone={urgency.tone}>
            Demande {urgency.label.toLowerCase()}
          </Text>
          <Text variant="title" numberOfLines={2}>
            {facility.name}
          </Text>
          <Text variant="caption" tone="muted">
            {facility.city}
          </Text>
        </View>
      </View>

      <View style={[styles.facts, { borderColor: colors.line }]}>
        {facts.map((fact, index) => (
          <View key={fact.label} style={[styles.fact, index > 0 && { borderLeftColor: colors.line, borderLeftWidth: StyleSheet.hairlineWidth }]}>
            <Text variant="caption" tone="subtle">
              {fact.label}
            </Text>
            <Text variant="bodyStrong" numberOfLines={2}>
              {fact.value}
            </Text>
          </View>
        ))}
      </View>

      {accepted ? (
        <Animated.View entering={FadeInDown.duration(motion.slow).easing(motion.easeOut)} style={styles.block}>
          <View style={styles.statusRow}>
            <StatusDot color="ok" pulse size={10} />
            <Text variant="heading" tone="ok">
              On vous attend
            </Text>
          </View>
          <Text variant="body" tone="muted">
            Présentez-vous au service de transfusion avec une pièce d’identité. Mangez léger et buvez de l’eau avant de
            venir.
          </Text>
          <View style={styles.actions}>
            <ActionButton icon="route" label="Itinéraire" onPress={() => openDirections(facility)} />
            {facility.phone_number ? (
              <ActionButton icon="phone" label="Appeler" onPress={() => callFacility(facility.phone_number!)} />
            ) : null}
          </View>
          <Pressable
            onPress={() => (confirmCancel ? send('cancelled') : setConfirmCancel(true))}
            disabled={respond.isPending}
            accessibilityRole="button"
            style={styles.cancel}
            hitSlop={8}
          >
            <Text variant="label" tone={confirmCancel ? 'brand' : 'muted'}>
              {confirmCancel ? 'Toucher à nouveau pour confirmer le désistement' : 'Je ne peux plus venir'}
            </Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(motion.base)} style={styles.block}>
          {status === 'declined' && (
            <Text variant="body" tone="muted">
              Vous avez décliné cette demande. Si votre situation a changé, vous pouvez encore y répondre.
            </Text>
          )}
          {status === 'cancelled' && (
            <Text variant="body" tone="muted">
              Vous avez annulé votre venue. L’hôpital ne compte plus sur vous pour cette demande.
            </Text>
          )}
          {donor.is_eligible ? (
            <Button label="Je viens donner" onPress={() => send('accepted')} loading={respond.isPending && respond.variables?.status === 'accepted'} haptic />
          ) : (
            <View style={[styles.notice, { backgroundColor: colors.raised }]}>
              <Text variant="label">Vous ne pouvez pas donner pour l’instant.</Text>
              <Text variant="caption" tone="muted">
                {donor.next_eligible_date
                  ? `Prochain don possible le ${formatDate(donor.next_eligible_date)}.`
                  : donor.ineligibility_reasons[0] ?? ''}
              </Text>
            </View>
          )}
          {status !== 'declined' && (
            <Button
              label="Pas cette fois"
              variant="ghost"
              onPress={() => send('declined')}
              disabled={respond.isPending}
              loading={respond.isPending && respond.variables?.status === 'declined'}
            />
          )}
        </Animated.View>
      )}

      {respond.error ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite" style={styles.center}>
          {respond.error.message}
        </Text>
      ) : null}
    </View>
  )
}

function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, { borderColor: colors.lineStrong, backgroundColor: pressed ? colors.raised : colors.surface }]}
    >
      <Icon name={icon} size={20} />
      <Text variant="bodyStrong">{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.xl },
  head: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  headText: { flex: 1, gap: 2 },
  facts: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md },
  fact: { flex: 1, paddingHorizontal: space.md, gap: 2 },
  block: { gap: space.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xs },
  action: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  cancel: { alignSelf: 'center', paddingVertical: space.sm },
  notice: { borderRadius: radius.md, padding: space.lg, gap: space.xs },
  missing: { alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: space.sm },
})
