import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  icon?: React.ReactNode
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  // Action principale : contraste maximal, sans couleur (la couleur signale un état).
  primary: 'bg-inverse text-on-inverse border border-transparent hover:opacity-90',
  secondary: 'bg-raised text-fg border border-line hover:border-line-strong',
  danger: 'bg-critical text-white border border-transparent hover:opacity-90',
  ghost: 'text-muted border border-transparent hover:bg-raised hover:text-fg',
  outline: 'bg-transparent text-fg border border-line-strong hover:bg-raised',
}

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  children,
  disabled,
  className = '',
  type = 'button',
  ...props
}) => {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded font-medium whitespace-nowrap transition-[background-color,border-color,opacity] duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
