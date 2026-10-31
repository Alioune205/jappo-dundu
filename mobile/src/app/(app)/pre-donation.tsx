import React, { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { space, useTheme } from '@/theme'

/**
 * Questions avant le don : un repérage, pas une décision. L'entretien
 * médical confidentiel, le jour du don, reste seul juge. Les réponses ne
 * quittent pas le téléphone.
 *
 * ⚠️ Liste à faire valider par le CNTS (contre-indications locales).
 */
const QUESTIONS: { id: string; text: string; advice: string }[] = [
  { id: 'fever', text: 'Avez-vous eu de la fièvre ou été malade ces 15 derniers jours ?', advice: 'Attendez 15 jours après la guérison.' },
  { id: 'malaria', text: 'Avez-vous eu le paludisme ces 4 derniers mois ?', advice: 'Attendez 4 mois après le traitement.' },
  { id: 'tattoo', text: 'Tatouage, piercing ou acupuncture ces 4 derniers mois ?', advice: 'Attendez 4 mois.' },
  { id: 'surgery', text: 'Opération, endoscopie ou soins dentaires lourds récents ?', advice: 'Parlez-en au médecin du centre avant de venir.' },
  { id: 'pregnant', text: 'Êtes-vous enceinte, ou avez-vous accouché ces 6 derniers mois ?', advice: 'Le don n’est pas possible pendant cette période.' },
  { id: 'meds', text: 'Prenez-vous des antibiotiques ou un traitement en ce moment ?', advice: 'Parlez-en au médecin du centre avant de venir.' },
  { id: 'fasting', text: 'Êtes-vous à jeun depuis ce matin ?', advice: 'Mangez léger et buvez de l’eau avant de venir.' },
]

export default function PreDonationScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const flagged = QUESTIONS.filter((q) => answers[q.id])
  const done = QUESTIONS.every((q) => answers[q.id] !== undefined)

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Retour" hitSlop={8}>
          <Icon name="back" size={22} />
        </Pressable>
        <Text variant="eyebrow" tone="brand">
          Avant de venir
        </Text>
      </View>
      <Text variant="display">Puis-je donner aujourd’hui ?</Text>
      <Text variant="body" tone="muted">
        Quelques questions pour éviter un déplacement inutile. Vos réponses restent sur votre téléphone ; le médecin du
        centre fait toujours l’entretien.
      </Text>

      {QUESTIONS.map((q) => (
        <Card key={q.id} style={styles.question}>
          <Text variant="body">{q.text}</Text>
          <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={q.text}>
            {([true, false] as const).map((value) => {
              const selected = answers[q.id] === value
              return (
                <Pressable
                  key={String(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setAnswers((a) => ({ ...a, [q.id]: value }))}
                  style={[
                    styles.choice,
                    { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : colors.surface },
                  ]}
                >
                  <Text variant="label">{value ? 'Oui' : 'Non'}</Text>
                </Pressable>
              )
            })}
          </View>
        </Card>
      ))}

      {done ? (
        <Card style={[styles.result, { borderColor: flagged.length ? colors.warning : colors.ok }]}>
          <Text variant="heading" tone={flagged.length ? 'warning' : 'ok'}>
            {flagged.length ? 'À vérifier avant de venir' : 'Rien ne s’oppose a priori à votre don'}
          </Text>
          {flagged.length ? (
            flagged.map((q) => (
              <Text key={q.id} variant="body">
                • {q.advice}
              </Text>
            ))
          ) : (
            <Text variant="body" tone="muted">
              Venez avec une pièce d’identité. L’entretien médical confirmera votre aptitude.
            </Text>
          )}
        </Card>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, gap: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  question: { gap: space.md },
  choices: { flexDirection: 'row', gap: space.sm },
  choice: { flex: 1, alignItems: 'center', paddingVertical: space.md, borderRadius: 10, borderWidth: 1 },
  result: { gap: space.sm, borderWidth: 1 },
})
