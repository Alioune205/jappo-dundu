import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Sheet } from '@/components/ui/Sheet'
import { Text } from '@/components/ui/Text'
import { radius, space, useTheme } from '@/theme'

/**
 * Engagements de l'application, en clair. Chaque point décrit un comportement
 * réel du code (backend sang/serializers.py, mobile lib/location.ts) : rien
 * qui ne soit tenu.
 */
const POINTS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'shield',
    title: 'Les hôpitaux ne vous voient pas d’emblée',
    body: 'Ils voient seulement des donneurs anonymes : groupe sanguin et distance. Votre nom et votre numéro ne leur sont transmis que si vous acceptez une demande, et pour cette demande.',
  },
  {
    icon: 'pin',
    title: 'Votre position reste approximative',
    body: 'Arrondie à environ 100 m sur votre téléphone, elle sert à calculer des distances. Elle n’est jamais montrée aux hôpitaux, et vous pouvez ne pas la partager.',
  },
  {
    icon: 'drop',
    title: 'Le don reste un choix',
    body: 'Une alerte n’engage à rien. Vous pouvez refuser, annuler votre venue, ou vous déclarer indisponible à tout moment depuis votre profil.',
  },
  {
    icon: 'bell',
    title: 'Des notifications utiles, rien d’autre',
    body: 'Uniquement les demandes compatibles avec votre groupe, proches de vous, quand vous pouvez donner. Pas de publicité.',
  },
]

export function TermsSheet({ visible, onClose, onAccept }: { visible: boolean; onClose: () => void; onAccept: () => void }) {
  const { colors } = useTheme()
  return (
    <Sheet visible={visible} onClose={onClose} label="Conditions et confidentialité">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="title">Conditions et confidentialité</Text>
        <Text variant="body" tone="muted">
          Jappo Dundu met en relation des donneurs volontaires et les hôpitaux du Sénégal. Voici ce que cela implique pour vous.
        </Text>
        {POINTS.map((point) => (
          <View key={point.title} style={styles.point}>
            <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
              <Icon name={point.icon} size={18} color="brand" />
            </View>
            <View style={styles.text}>
              <Text variant="bodyStrong">{point.title}</Text>
              <Text variant="caption" tone="muted">
                {point.body}
              </Text>
            </View>
          </View>
        ))}
        <Button label="J’ai compris et j’accepte" onPress={onAccept} style={styles.button} />
      </ScrollView>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingBottom: space.sm },
  point: { flexDirection: 'row', gap: space.md },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  button: { marginTop: space.sm },
})
