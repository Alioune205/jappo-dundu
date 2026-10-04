import { ApiError, parseError, refreshTokens, request } from '@/lib/api'
import { session } from '@/lib/session'

jest.mock('@/lib/session', () => {
  let access: string | null = null
  let refresh: string | null = null
  return {
    session: {
      getAccess: () => access,
      getRefresh: () => refresh,
      setTokens: jest.fn(async (a: string, r: string) => {
        access = a
        refresh = r
      }),
      clear: jest.fn(async () => {
        access = null
        refresh = null
      }),
      restore: jest.fn(async () => refresh),
    },
  }
})

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body }) as Response

describe('parseError', () => {
  it('reprend le message « detail » de DRF', () => {
    expect(parseError(409, { detail: 'Demande déjà clôturée.' }).message).toBe('Demande déjà clôturée.')
  })

  it('rattache les erreurs à leur champ', () => {
    const error = parseError(400, { phone_number: ['Numéro déjà utilisé.'], username: 'Pris.' })
    expect(error.fieldErrors).toEqual({ phone_number: ['Numéro déjà utilisé.'], username: ['Pris.'] })
    expect(error.message).toBe('Vérifiez les champs signalés.')
  })

  it('distingue le champ « code » du code technique de DRF', () => {
    expect(parseError(400, { code: ['Code incorrect. Encore 4 essais.'] }).fieldErrors.code).toEqual(['Code incorrect. Encore 4 essais.'])
    expect(parseError(401, { detail: 'Jeton expiré.', code: 'token_not_valid' }).fieldErrors).toEqual({})
  })

  it('donne un message lisible sans corps de réponse', () => {
    expect(parseError(503, undefined).message).toMatch(/serveur/)
    expect(parseError(0, undefined).message).toMatch(/Internet/)
  })
})

describe('rafraîchissement du jeton', () => {
  beforeEach(async () => {
    await session.setTokens('access-expire', 'refresh-1')
  })

  it('un seul appel réseau pour plusieurs requêtes simultanées', async () => {
    let refreshCalls = 0
    globalThis.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/api/auth/token/refresh/')) {
        refreshCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return json(200, { access: 'access-neuf', refresh: 'refresh-2' })
      }
      return json(200, {})
    }) as jest.Mock

    const results = await Promise.all([refreshTokens(), refreshTokens(), refreshTokens()])
    expect(results).toEqual([true, true, true])
    // Le backend fait tourner le refresh token : un second appel avec l'ancien serait refusé.
    expect(refreshCalls).toBe(1)
    expect(session.getRefresh()).toBe('refresh-2')
  })

  it('rejoue la requête une fois après un 401, avec le nouveau jeton', async () => {
    const seen: (string | undefined)[] = []
    globalThis.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/api/auth/token/refresh/')) return json(200, { access: 'access-neuf', refresh: 'refresh-2' })
      const auth = (init?.headers as Record<string, string>)?.Authorization
      seen.push(auth)
      return auth === 'Bearer access-neuf' ? json(200, { ok: true }) : json(401, { detail: 'expiré' })
    }) as jest.Mock

    await expect(request('/api/sang/donors/me/')).resolves.toEqual({ ok: true })
    expect(seen).toEqual(['Bearer access-expire', 'Bearer access-neuf'])
  })

  it('une coupure réseau devient une ApiError lisible (statut 0)', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed')
    }) as jest.Mock
    await expect(request('/api/users/me/')).rejects.toMatchObject({ status: 0 })
    await expect(request('/api/users/me/')).rejects.toBeInstanceOf(ApiError)
  })
})
