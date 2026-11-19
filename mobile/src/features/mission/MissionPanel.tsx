import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { StatusDot } from '@/components/ui/StatusDot'
import { Text } from '@/components/ui/Text'
import { callFacility, openDirections } from '@/features/alerts/format'
import { timeAgo } from '@/lib/dates'
import type { DriverStep } from '@/lib/missions'
import { motion, radius, space, useTheme } from '@/theme'
import type { Mission } from '@/types/api'
import { currentTarget, nextAction, PRIORITY, stepIndex, STEPS } from './format'

interface MissionPanelProps {
  mission: Mission
  now: number
  /** Changement d'hôpital (possible tant que le patient n'est pas en transport). */
  onChooseDestination: () => void
}

/**
 * Mission en cours : où aller, comment s'y rendre, qui appeler. Rien d'autre.
 * Le geste qui fait avancer la mission est à part (MissionActions), collé au
 * bas de l'écran pour rester sous le pouce.
 */
export function MissionPanel({ mission, now, onChooseDestination }: MissionPanelProps) {
  const { colors } = useTheme()
  const priority = PRIORITY[mission.priority]
  const target = currentTarget(mission)
  const current = stepIndex(mission.status)
  const toHospital = target?.kind === 'destination'
  const dot = mission.priority === 'critical' ? 'brand' : mission.priority === 'urgent' ? 'warning' : 'muted'

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).easing(motion.easeOut)} layout={LinearTransition.duration(motion.base)} style={styles.stack}>
      <View style={styles.meta}>
        <View style={[styles.chip, { backgroundColor: mission.priority === 'critical' ? colors.brandSoft : colors.raised }]}>
          <StatusDot color={dot} size={8} pulse={mission.priority === 'critical'} />
          <Text variant="label" tone={priority.tone}>
            {priority.label}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          Mission n° {mission.id} · signalée {timeAgo(mission.created_at, now)}
        </Text>
      </View>

      <View style={styles.where}>
        <Text variant="caption" tone="muted">
          {toHospital ? 'Hôpital de destination' : 'Lieu d’intervention'}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {target?.name ?? mission.pickup_address}
        </Text>
        {mission.description ? (
          <Text variant="body" tone="muted">
            {mission.description}
          </Text>
        ) : null}
      </View>

      <Progress current={current} />

      {target ? (
        <View style={styles.actions}>
          <ActionButton icon="route" label="Itinéraire" onPress={() => openDirections(target)} />
          {target.phone ? (
            <ActionButton icon="phone" label="Appeler" onPress={() => callFacility(target.phone!)} />
          ) : null}
        </View>
      ) : null}

      {mission.destination && !toHospital ? (
        <Card style={styles.destination}>
          <Icon name="hospital" size={20} color="muted" />
          <View style={styles.destinationText}>
            <Text variant="caption" tone="muted">
              Hôpital prévu
            </Text>
            <Text variant="bodyStrong" numberOfLines={1}>
              {mission.destination.name}
            </Text>
          </View>
          {mission.status === 'on_site' ? (
            <Pressable onPress={onChooseDestination} accessibilityRole="button" accessibilityLabel="Changer d’hôpital" hitSlop={12}>
              <Text variant="label" tone="brand">
                Changer
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {mission.destination_status === 'refused' ? (
        <View style={[styles.note, { backgroundColor: colors.brandSoft }]}>
          <Icon name="alert" size={18} color="brand" />
          <Text variant="label" tone="brand" style={styles.noteText}>
            Destination refusée{mission.destination_note ? ` : ${mission.destination_note}` : ''}. La régulation vous réoriente.
          </Text>
        </View>
      ) : mission.destination_status === 'accepted' ? (
        <View style={[styles.note, styles.noteQuiet]}>
          <Icon name="check" size={18} color="ok" />
          <Text variant="label" tone="ok" style={styles.noteText}>
            L’hôpital attend le patient
          </Text>
        </View>
      ) : null}
    </Animated.View>
  )
}

interface MissionActionsProps {
  mission: Mission
  busy: boolean
  error: string | null
  onAdvance: (status: DriverStep) => void
  /** Transport demandé sans destination : ouvre le choix de l'hôpital. */
  onChooseDestination: () => void
}

/** Le seul geste utile à cet instant, en grand ; terminer sans transport reste discret et se confirme. */
export function MissionActions({ mission, busy, error, onAdvance, onChooseDestination }: MissionActionsProps) {
  const [confirmFinish, setConfirmFinish] = useState(false)
  const action = nextAction(mission)
  if (!action) return null
  return (
    <View style={styles.footer}>
      {error ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite" style={styles.center}>
          {error}
        </Text>
      ) : null}
      <Button
        label={action.needsDestination ? 'Choisir l’hôpital et transporter' : action.label}
        onPress={() => (action.needsDestination ? onChooseDestination() : onAdvance(action.status))}
        loading={busy}
        style={styles.primary}
        haptic
      />
      {mission.status === 'on_site' ? (
        <Pressable
          onPress={() => {
            if (!confirmFinish) return setConfirmFinish(true)
            setConfirmFinish(false)
            onAdvance('completed')
          }}
          disabled={busy}
          accessibilityRole="button"
          style={styles.secondary}
          hitSlop={8}
        >
          <Text variant="label" tone={confirmFinish ? 'brand' : 'muted'}>
            {confirmFinish ? 'Toucher à nouveau pour terminer sans transport' : 'Terminer sur place (sans transport)'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** Quatre segments et l'étape en toutes lettres : « Étape 2 sur 4 · Sur place ». */
function Progress({ current }: { current: number }) {
  const { colors } = useTheme()
  const step = STEPS[Math.max(current, 0)]
  return (
    <View style={styles.progress} accessibilityLabel={`Étape ${current + 1} sur ${STEPS.length} : ${step.label}`}>
      <View style={styles.bars}>
        {STEPS.map((item, index) => (
          <View key={item.status} style={[styles.bar, { backgroundColor: index <= current ? colors.ok : colors.line }]} />
        ))}
      </View>
      <Text variant="label" tone="muted">
        Étape {current + 1} sur {STEPS.length} · <Text variant="label">{step.label}</Text>
      </Text>
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
      <Text variant="bodyStrong" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.xl },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: radius.pill },
  where: { gap: space.xs },
  progress: { gap: space.sm },
  bars: { flexDirection: 'row', gap: space.xs },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  actions: { flexDirection: 'row', gap: space.md },
  action: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  destination: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  destinationText: { flex: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  noteText: { flex: 1 },
  noteQuiet: { paddingHorizontal: 0, paddingVertical: 0 },
  footer: { gap: space.sm },
  primary: { height: 64 },
  secondary: { alignSelf: 'center', paddingVertical: space.xs },
  center: { textAlign: 'center' },
})
