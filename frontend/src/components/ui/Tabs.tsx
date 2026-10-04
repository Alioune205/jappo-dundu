import React from 'react'

export interface TabItem<T extends string = string> {
  id: T
  label: string
  count?: number
  icon?: React.ReactNode
}

interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[]
  activeTab: T
  onChange: (id: T) => void
  className?: string
}

/** Onglets soulignés : l'onglet actif est marqué par un trait, pas par une couleur de fond. */
export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabsProps<T>) {
  return (
    <div role="tablist" className={`flex items-center gap-4 border-b border-line ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`-mb-px flex cursor-pointer select-none items-center gap-1.5 border-b-2 pb-2 pt-1 text-sm font-medium transition-colors ${
              isActive ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`num text-xs ${isActive ? 'text-fg' : 'text-subtle'}`}>{tab.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
