import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { formatGroup, spokenGroup } from '@/components/ui/BloodGroup'
import { Icon } from '@/components/ui/Icon'
import { QrCode } from '@/components/ui/QrCode'
import { Text } from '@/components/ui/Text'
import { useAuth } from '@/context/AuthContext'
import { donorCode } from '@/features/donor/content'
import { formatDate } from '@/lib/dates'
import { useDonor, useHistory } from '@/lib/queries'
import { fonts, motion, radius, space, useTheme } from '@/theme'

const enter = (step: number) => FadeInDown.duration(motion.slow).delay(step * motion.stagger).easing(motion.easeOut)

/**
 * Ma carte donneur : QR code (identifiant et groupe) et carte rouge
 * récapitulative, à montrer au centre de don.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
export default function CardScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { data: donor } = useDonor()
  const history = useHistory()
  if (!donor) return null

  const donations = history.data?.donations.length ?? 0
  const lastDonation = donor.last_donation_date ?? history.data?.donations[0]?.donated_on ?? null
  const declaredOnly = lastDonation !== null && donations === 0
  const code = donorCode(donor.id)

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.title}>
        <Icon name="sparkle" size={22} />
        <Text variant="display" accessibilityRole="header">
          Ma carte donneur
        </Text>
      </View>

      <Animated.View entering={enter(0)} style={[styles.qrCard, { backgroundColor: '#FFFFFF', borderColor: colors.line }]}>
        <QrCode value={`JAPPODUNDU:DONNEUR:${code}:${donor.blood_group}`} size={196} />
        <Text variant="mono" style={styles.code}>
          {code}
        </Text>
      </Animated.View>

      <Animated.View entering={enter(1)} style={[styles.card, { backgroundColor: colors.brand }]}>
        <View pointerEvents="none" style={styles.glow} />
        <View style={styles.cardHead}>
          <Text style={styles.brand}>Jappo Dundu</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>DONNEUR</Text>
          </View>
        </View>

        <Text style={styles.name} numberOfLines={2}>
          {(user?.full_name || user?.username || '').toUpperCase()}
        </Text>
        <Text style={styles.caption}>Groupe sanguin</Text>
        <Text style={styles.group} accessibilityLabel={`Groupe ${spokenGroup(donor.blood_group)}`}>
          {formatGroup(donor.blood_group)}
        </Text>

        <View style={styles.footer}>
          <View style={styles.footerCell}>
            <Text style={styles.footerValue}>{String(donations).padStart(2, '0')}</Text>
            <Text style={styles.caption}>{donations > 1 ? 'Dons enregistrés' : 'Don enregistré'}</Text>
          </View>
          <View style={styles.separator} />
          <View style={[styles.footerCell, styles.footerEnd]}>
            <Text style={styles.footerValue}>{lastDonation ? formatDate(lastDonation, { short: true }) : '—'}</Text>
            <Text style={styles.caption}>{declaredOnly ? 'Dernier don (déclaré)' : 'Dernier don'}</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={enter(2)} style={[styles.info, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Icon name={donor.is_eligible ? 'check' : 'calendar'} size={20} color={donor.is_eligible ? 'ok' : 'muted'} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">
            {donor.is_eligible
              ? 'Apte à donner'
              : donor.next_eligible_date
                ? `Prochain don le ${formatDate(donor.next_eligible_date)}`
                : 'Don impossible pour le moment'}
          </Text>
          <Text variant="caption" tone="muted">
            Montrez cette carte à l’accueil du centre de don : elle porte votre identifiant donneur et votre groupe
            sanguin. Le groupe est toujours contrôlé par le centre avant le prélèvement.
          </Text>
        </View>
      </Animated.View>
    </ScrollView>
  )
}

const white = '#FFFFFF'

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.xl },
  flex: { flex: 1, gap: 2 },
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  qrCard: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  code: { color: '#57606A', letterSpacing: 2 },
  card: {
    borderRadius: 24,
    padding: space.xl,
    overflow: 'hidden',
    shadowColor: '#7A0A10',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  glow: {
    position: 'absolute',
    right: -60,
    top: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: white },
  pill: { backgroundColor: 'rgba(255, 255, 255, 0.92)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 3 },
  pillText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, color: '#B3121A' },
  name: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, color: white, textAlign: 'center', marginTop: space.lg },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: 'rgba(255, 255, 255, 0.82)', textAlign: 'center' },
  group: { fontFamily: fonts.semibold, fontSize: 44, lineHeight: 52, color: white, textAlign: 'center', letterSpacing: -1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
  },
  footerCell: { flex: 1, alignItems: 'flex-start' },
  footerEnd: { alignItems: 'flex-end' },
  footerValue: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: white },
  separator: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255, 255, 255, 0.35)', marginHorizontal: space.lg },
  info: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
})
