import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { QrCode } from '@/components/ui/QrCode'
import { cardQrPayload } from '@/features/donor/content'

describe('Carte donneur', () => {
  it('le QR code porte le code aléatoire de la carte, lu par le centre de don', () => {
    expect(cardQrPayload('JD-CDKK-B3TT')).toBe('JAPPODUNDU:DONNEUR:JD-CDKK-B3TT')
  })

  it('dessine un QR code accessible', async () => {
    await render(<QrCode value={cardQrPayload('JD-CDKK-B3TT')} size={120} />)
    expect(screen.getByLabelText('QR code du donneur')).toBeTruthy()
  })
})
