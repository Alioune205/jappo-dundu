import React, { useMemo } from 'react'
import createQr from 'qrcode-generator'

/** QR code dessiné en SVG (une seule forme : rendu net à toutes les tailles), comme sur le mobile. */
export const QrCode: React.FC<{ value: string; size?: number; label: string }> = ({ value, size = 180, label }) => {
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

  // Zone de silence de 2 modules autour du code ; toujours noir sur blanc (lecture fiable).
  const box = count + 4
  return (
    <svg
      width={size}
      height={size}
      viewBox={`-2 -2 ${box} ${box}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x={-2} y={-2} width={box} height={box} fill="#FFFFFF" />
      <path d={path} fill="#0D1117" />
    </svg>
  )
}
