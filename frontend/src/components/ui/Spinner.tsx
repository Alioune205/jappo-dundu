import React from 'react'

export const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center gap-3" role="status">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-fg" aria-hidden="true" />
    <span className="text-xs text-muted">{label}</span>
  </div>
)
