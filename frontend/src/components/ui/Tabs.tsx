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

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabsProps<T>) {
  return (
    <div className={`flex items-center gap-1.5 p-1 bg-ink-900 border border-white/10 rounded-xl ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 select-none cursor-pointer ${
              isActive
                ? 'bg-brand-600 text-white shadow-md'
                : 'text-ink-400 hover:text-ink-100 hover:bg-white/[0.04]'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                  isActive ? 'bg-white/25 text-white' : 'bg-ink-800 text-ink-300'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
