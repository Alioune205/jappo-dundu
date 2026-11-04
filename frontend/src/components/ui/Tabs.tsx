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

/**
 * Onglets en pastilles, sur un rail : l'onglet actif se détache en blanc,
 * comme le sélecteur segmenté des tableaux de bord.
 */
export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabsProps<T>) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <div role="tablist" className="inline-flex items-center gap-1 rounded-full bg-sunken p-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`flex h-9 cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ${
                isActive
                  ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(16_24_40/0.08),0_0_0_1px_var(--line)]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold ${
                    isActive ? 'bg-ink text-on-ink dark:bg-brand dark:text-on-brand' : 'bg-surface/70 text-subtle'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
