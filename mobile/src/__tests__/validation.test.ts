import { EMPTY_REGISTRATION, formatPhoneInput, nationalDigits, passwordStrength, validateRegistration } from '@/lib/validation'

const VALID = {
  first_name: 'Awa',
  last_name: 'Ndiaye',
  phone_number: '77 123 45 67',
  region: 'thies' as const,
  password: 'motdepasse-solide',
  confirm: 'motdepasse-solide',
  terms: true,
}

describe('validateRegistration', () => {
  it('accepte un formulaire complet', () => {
    expect(validateRegistration(VALID)).toEqual({})
  })

  it('signale chaque champ manquant, conditions comprises', () => {
    expect(Object.keys(validateRegistration(EMPTY_REGISTRATION)).sort()).toEqual(
      ['first_name', 'last_name', 'password', 'phone_number', 'region', 'terms'].sort()
    )
  })

  it('exige un numéro sénégalais à 9 chiffres, quels que soient les espaces', () => {
    expect(validateRegistration({ ...VALID, phone_number: '77 12' }).phone_number).toBeDefined()
    expect(validateRegistration({ ...VALID, phone_number: '+221 77 123 45 67' }).phone_number).toBeUndefined()
    expect(validateRegistration({ ...VALID, phone_number: '12 345 67 89' }).phone_number).toBeDefined()
  })

  it('refuse un mot de passe court, tout en chiffres, ou mal confirmé', () => {
    expect(validateRegistration({ ...VALID, password: 'court', confirm: 'court' }).password).toEqual(['8 caractères minimum.'])
    expect(validateRegistration({ ...VALID, password: '12345678', confirm: '12345678' }).password).toBeDefined()
    expect(validateRegistration({ ...VALID, confirm: 'autre-chose' }).confirm).toBeDefined()
  })
})

describe('téléphone et mot de passe', () => {
  it('extrait les 9 chiffres nationaux', () => {
    expect(nationalDigits('77 123 45 67')).toBe('771234567')
    expect(nationalDigits('+221771234567')).toBe('771234567')
    expect(nationalDigits('00221 33 869 18 18')).toBe('338691818')
    expect(nationalDigits('5512')).toBeNull()
  })

  it('groupe le numéro pendant la frappe', () => {
    expect(formatPhoneInput('7712')).toBe('77 12')
    expect(formatPhoneInput('771234567')).toBe('77 123 45 67')
    expect(formatPhoneInput('77123456789')).toBe('77 123 45 67')
  })

  it('note la solidité du mot de passe', () => {
    expect(passwordStrength('court')).toBe(0)
    expect(passwordStrength('motdepasse')).toBe(1)
    expect(passwordStrength('motdepasse1')).toBe(2)
    expect(passwordStrength('Mot-de-passe-2026')).toBe(3)
  })
})
