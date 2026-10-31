import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { TextField } from '@/components/ui/TextField'
import { api } from '@/lib/api'
import { space, useTheme } from '@/theme'

interface Contact {
  name: string
  phone: string
  relation: string
}

interface EmergencyProfile {
  share_with_samu: boolean
  allergies: string
  conditions: string
  medications: string
  contacts: Contact[]
  notify_contacts: boolean
}

const KEY = ['emergency-profile'] as const
const MAX_CONTACTS = 3

/**
 * Fiche d'urgence : ce que le SAMU doit savoir (allergies, maladies,
 * traitements) et qui prévenir. Rien n'est partagé sans accord explicite :
 * deux interrupteurs distincts, désactivés par défaut.
 */
export default function EmergencyCardScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data } = useQuery({ queryKey: KEY, queryFn: () => api.get<EmergencyProfile>('/api/ambulances/sos/profile/') })

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Retour" hitSlop={8}>
          <Icon name="back" size={22} />
        </Pressable>
        <Text variant="eyebrow" tone="brand">
          Fiche d’urgence
        </Text>
      </View>
      {data ? <EmergencyForm key={JSON.stringify(data)} initial={data} onSaved={() => router.back()} /> : <ActivityIndicator />}
    </ScrollView>
  )
}

function EmergencyForm({ initial, onSaved }: { initial: EmergencyProfile; onSaved: () => void }) {
  const { colors } = useTheme()
  const client = useQueryClient()
  const [form, setForm] = useState<EmergencyProfile>(initial)
  const set = (patch: Partial<EmergencyProfile>) => setForm((current) => ({ ...current, ...patch }))
  const setContact = (index: number, patch: Partial<Contact>) =>
    set({ contacts: form.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)) })

  const save = useMutation({
    mutationFn: () =>
      api.put<EmergencyProfile>('/api/ambulances/sos/profile/', {
        ...form,
        contacts: form.contacts.filter((c) => c.name.trim() && c.phone.trim()),
      }),
    onSuccess: (saved) => {
      client.setQueryData(KEY, saved)
      onSaved()
    },
  })

  return (
    <View style={styles.stack}>
      <Text variant="display">Ce que le SAMU doit savoir</Text>
      <Text variant="body" tone="muted">
        En cas d’alerte SOS, ces informations aident l’équipe à vous soigner plus vite.
      </Text>

      <Card style={styles.block}>
        <TextField label="Allergies" placeholder="ex. pénicilline, arachide" value={form.allergies} onChangeText={(allergies) => set({ allergies })} maxLength={255} />
        <TextField label="Maladies chroniques" placeholder="ex. diabète, drépanocytose, asthme" value={form.conditions} onChangeText={(conditions) => set({ conditions })} maxLength={255} />
        <TextField label="Traitements en cours" placeholder="ex. insuline" value={form.medications} onChangeText={(medications) => set({ medications })} maxLength={255} />
        <ConsentRow
          label="Partager cette fiche avec le SAMU lors d’une alerte"
          value={form.share_with_samu}
          onChange={(share_with_samu) => set({ share_with_samu })}
        />
      </Card>

      <Card style={styles.block}>
        <Text variant="heading">Personnes à prévenir</Text>
        {form.contacts.map((contact, index) => (
          <View key={index} style={[styles.contact, { borderColor: colors.line }]}>
            <TextField label="Nom" value={contact.name} onChangeText={(name) => setContact(index, { name })} maxLength={80} />
            <TextField label="Téléphone" keyboardType="phone-pad" value={contact.phone} onChangeText={(phone) => setContact(index, { phone })} />
            <TextField label="Lien (facultatif)" placeholder="ex. sœur" value={contact.relation} onChangeText={(relation) => setContact(index, { relation })} maxLength={40} />
            <Pressable onPress={() => set({ contacts: form.contacts.filter((_, i) => i !== index) })} accessibilityRole="button">
              <Text variant="label" tone="muted">
                Retirer ce contact
              </Text>
            </Pressable>
          </View>
        ))}
        {form.contacts.length < MAX_CONTACTS ? (
          <Button
            label="Ajouter un contact"
            variant="secondary"
            onPress={() => set({ contacts: [...form.contacts, { name: '', phone: '', relation: '' }] })}
          />
        ) : null}
        <ConsentRow
          label="Les prévenir par SMS quand j’envoie une alerte SOS"
          value={form.notify_contacts}
          onChange={(notify_contacts) => set({ notify_contacts })}
        />
      </Card>

      {save.error ? (
        <Text variant="caption" tone="brand">
          {save.error instanceof Error ? save.error.message : 'Enregistrement impossible.'}
        </Text>
      ) : null}
      <Button label="Enregistrer ma fiche" onPress={() => save.mutate()} loading={save.isPending} haptic />
    </View>
  )
}

function ConsentRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme()
  return (
    <View style={styles.consent}>
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brand, false: colors.line }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, gap: space.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stack: { gap: space.lg },
  block: { gap: space.md },
  contact: { gap: space.sm, borderTopWidth: 1, paddingTop: space.md },
  consent: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
})
