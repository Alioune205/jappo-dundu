import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, Clock3, Flame, MapPin } from 'lucide-react'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { useThemeColors } from '@/lib/useThemeColors'

interface Demand {
  days: number
  by_hour: number[]
  by_weekday: number[]
  zones: { latitude: number; longitude: number; count: number; peak_hour: number }[]
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')} h`
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/**
 * Quand et où les appels arrivent (30 derniers jours) : placer les ambulances
 * disponibles près des zones chaudes de l'heure qui vient.
 */
export const DemandPanel: React.FC = () => {
  const colors = useThemeColors()
  const [mode, setMode] = useState<'hour' | 'weekday'>('hour')

  const { data } = useQuery<Demand>({
    queryKey: ['missions-demand'],
    queryFn: () => api.get<Demand>('/api/ambulances/missions/demand/', { days: 30 }),
    staleTime: 10 * 60_000,
  })
  if (!data) return null

  const total = data.by_hour.reduce((a, b) => a + b, 0)
  const peak = data.by_hour.indexOf(Math.max(...data.by_hour))
  const nextHour = (new Date().getHours() + 1) % 24

  const weekdaySource = Array.isArray(data.by_weekday) && data.by_weekday.length === 7 ? data.by_weekday : [0, 0, 0, 0, 0, 0, 0]
  const peakWeekday = weekdaySource.indexOf(Math.max(...weekdaySource))

  const chart =
    mode === 'hour'
      ? data.by_hour.map((count, hour) => ({
          label: hourLabel(hour),
          count,
          isPeak: hour === peak && count > 0,
        }))
      : weekdaySource.map((count, idx) => ({
          label: WEEKDAY_LABELS[idx] ?? `J${idx + 1}`,
          count,
          isPeak: idx === peakWeekday && count > 0,
        }))

  const maxZoneCount = data.zones.length > 0 ? Math.max(...data.zones.map((z) => z.count), 1) : 1

  return (
    <section className="panel dash-panel-in overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Clock3 className="h-4 w-4 text-brand" aria-hidden="true" />
            Appels par heure
          </h2>
          <p className="text-xs text-muted">
            {total === 0
              ? `Aucune mission sur ${data.days} jours.`
              : `${formatNumber(total)} missions sur ${data.days} jours · pic vers ${hourLabel(peak)}`}
          </p>
        </div>
        {total > 0 && (
          <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('hour')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                mode === 'hour' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'
              }`}
            >
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              24 heures
            </button>
            <button
              type="button"
              onClick={() => setMode('weekday')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                mode === 'weekday' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'
              }`}
            >
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              7 jours
            </button>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="grid gap-5 p-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 6, right: 6, left: -24, bottom: 0 }} barCategoryGap={mode === 'hour' ? 2 : 10}>
                <CartesianGrid stroke={colors.line} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: colors.muted }}
                  tickLine={false}
                  axisLine={{ stroke: colors.line }}
                  fontSize={10}
                  interval={mode === 'hour' ? 2 : 0}
                />
                <YAxis
                  tick={{ fill: colors.muted }}
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: colors.raised }}
                  contentStyle={{
                    backgroundColor: colors.surface,
                    borderColor: colors.lineStrong,
                    borderRadius: 10,
                    fontSize: 12,
                    color: colors.fg,
                  }}
                  labelStyle={{ color: colors.fg, fontWeight: 600 }}
                  itemStyle={{ color: colors.muted }}
                  formatter={(value) => [`${value ?? 0} mission(s)`, 'Appels']}
                />
                <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={mode === 'hour' ? 18 : 34}>
                  {chart.map((entry) => (
                    <Cell key={entry.label} fill={entry.isPeak ? colors.critical : colors.info} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Lecture sans graphique (lecteurs d'écran). */}
            <table className="sr-only">
              <caption>Missions par heure sur {data.days} jours</caption>
              <tbody>
                {data.by_hour.map((count, hour) => (
                  <tr key={hour}>
                    <th scope="row">{hourLabel(hour)}</th>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="eyebrow mb-2.5 flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              Zones les plus actives
            </p>
            <ol className="space-y-2.5 text-xs">
              {data.zones.map((zone, index) => {
                const ratio = Math.round((zone.count / maxZoneCount) * 100)
                return (
                  <li key={`${zone.latitude},${zone.longitude}`} className="rounded-lg border border-line/70 bg-subtle/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <a
                        className="inline-flex items-center gap-1.5 font-medium text-fg hover:text-brand hover:underline"
                        href={`https://www.openstreetmap.org/?mlat=${zone.latitude}&mlon=${zone.longitude}#map=15/${zone.latitude}/${zone.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                        Zone {index + 1}
                      </a>
                      <span className="num text-muted">
                        {zone.count} · pic {hourLabel(zone.peak_hour)}
                        {zone.peak_hour === nextHour && (
                          <span className="ml-1 font-semibold text-warning">· l’heure qui vient</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                      <div
                        className="bar-origin-left h-full rounded-full bg-brand"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  )
}
