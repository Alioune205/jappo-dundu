import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { QrCode } from '@/components/ui/QrCode'
import { donorCode } from '@/features/donor/content'

describe('Carte donneur', () => {
  it('formate l’identifiant donneur sur six chiffres', () => {
    expect(donorCode(42)).toBe('JD-000042')
    expect(donorCode(1234567)).toBe('JD-1234567')
  })

  it('dessine un QR code accessible', async () => {
    await render(<QrCode value="JAPPODUNDU:DONNEUR:JD-000042:O+" size={120} />)
    expect(screen.getByLabelText('QR code du donneur')).toBeTruthy()
  })
})
