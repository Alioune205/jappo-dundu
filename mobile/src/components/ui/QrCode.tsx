import React, { useMemo } from 'react'
import Svg, { Path, Rect } from 'react-native-svg'
import createQr from 'qrcode-generator'

interface QrCodeProps {
  value: string
  size?: number
  color?: string
  background?: string
}

/** QR code dessiné en SVG (une seule forme : rendu net à toutes les tailles). */
export function QrCode({ value, size = 180, color = '#0D1117', background = '#FFFFFF' }: QrCodeProps) {
  const { path, count } = useMemo(() => {
    const qr = createQr(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
      }
    }
    return { path: d, count: n }
  }, [value])

  // Zone de silence de 2 modules autour du code.
  const box = count + 4
  return (
    <Svg width={size} height={size} viewBox={`-2 -2 ${box} ${box}`} accessibilityLabel="QR code du donneur">
      <Rect x={-2} y={-2} width={box} height={box} fill={background} />
      <Path d={path} fill={color} />
    </Svg>
  )
}
