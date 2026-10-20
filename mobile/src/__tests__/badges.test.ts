import { badgeView, orderedBadges, projectDonations } from '@/features/badges/badges'
import type { GamificationBadge, GamificationProfile } from '@/types/api'

const badge = (over: Partial<GamificationBadge>): GamificationBadge => ({
  id: 1,
  code: 'regular_donor',
  name: 'Donneur Régulier',
  description: 'A effectué au moins 3 dons de sang.',
  icon: 'repeat',
  points_bonus: 150,
  category: 'milestone',
  required_donations: 3,
  unlocked: false,
  ...over,
})

describe('badgeView', () => {
  it('palier verrouillé : dons restants et progression', () => {
    const view = badgeView(badge({}), 1)
    expect(view.condition).toBe('3 dons')
    expect(view.status).toBe('Encore 2 dons')
    expect(view.progress).toBeCloseTo(1 / 3)
    expect(view.icon).toBe('pulse')
  })

  it('badge obtenu : barre pleine', () => {
    const view = badgeView(badge({ unlocked: true, awarded_at: '2026-10-01T10:00:00Z' }), 4)
    expect(view.status).toBe('Obtenu')
    expect(view.progress).toBe(1)
  })

  it('condition particulière : libellé dédié, pas de barre', () => {
    const view = badgeView(badge({ code: 'life_saver', category: 'solidarity', required_donations: 0, icon: 'zap' }), 2)
    expect(view.condition).toBe('Urgence critique')
    expect(view.progress).toBeNull()
    expect(view.icon).toBe('alert')
  })
})

describe('orderedBadges', () => {
  it('paliers croissants, obtenus et verrouillés mêlés, puis les badges particuliers', () => {
    const profile = {
      donations_count: 1,
      badges: [badge({ id: 1, code: 'first_donation', required_donations: 1, unlocked: true })],
      locked_badges: [
        badge({ id: 7, code: 'life_saver', category: 'solidarity', required_donations: 0 }),
        badge({ id: 3, code: 'bronze_donor', required_donations: 5 }),
        badge({ id: 2, code: 'regular_donor', required_donations: 3 }),
      ],
    } as unknown as GamificationProfile
    expect(orderedBadges(profile).map((v) => v.badge.code)).toEqual(['first_donation', 'regular_donor', 'bronze_donor', 'life_saver'])
  })
})

describe('projectDonations (règles CNTS)', () => {
  const today = new Date(2026, 9, 19)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  it('homme : 90 jours après le dernier don, puis tous les 90 jours', () => {
    const [first, second] = projectDonations('M', ['2026-10-01'], 2, today)
    expect(iso(first)).toBe('2026-12-30')
    expect(iso(second)).toBe('2027-03-30')
  })

  it('femme : 120 jours, et pas plus de 3 dons sur 365 jours', () => {
    const dates = projectDonations('F', [], 4, today).map(iso)
    expect(dates.slice(0, 3)).toEqual(['2026-10-19', '2027-02-16', '2027-06-16'])
    // 4e don : 120 jours plus tard serait le 14/10/2027, avant les 365 jours du 1er.
    expect(dates[3]).toBe('2027-10-19')
  })

  it('sans don passé : dès aujourd’hui', () => {
    expect(iso(projectDonations('M', [], 1, today)[0])).toBe('2026-10-19')
  })
})

describe('badgeView avec l’échéance CNTS', () => {
  it('indique le mois au plus tôt', () => {
    const view = badgeView(badge({}), 1, (n) => (n === 2 ? new Date(2027, 2, 30) : null))
    expect(view.status).toBe('Encore 2 dons · au plus tôt en mars 2027')
  })
})
