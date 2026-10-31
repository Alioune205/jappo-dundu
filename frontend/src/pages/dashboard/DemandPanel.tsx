import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Clock3, MapPin } from 'lucide-react'
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

/**
 * Quand et où les appels arrivent (30 derniers jours) : placer les ambulances
 * disponibles près des zones chaudes de l'heure qui vient.
 */
export const DemandPanel: React.FC = () => {
  const colors = useThemeColors()
  const { data } = useQuery<Demand>({
    queryKey: ['missions-demand'],
    queryFn: () => api.get<Demand>('/api/ambulances/missions/demand/', { days: 30 }),
    staleTime: 10 * 60_000,
  })
  if (!data) return null
  const total = data.by_hour.reduce((a, b) => a + b, 0)
  const chart = data.by_hour.map((count, hour) => ({ hour: hourLabel(hour), count }))
  const peak = data.by_hour.indexOf(Math.max(...data.by_hour))
  const nextHour = (new Date().getHours() + 1) % 24

  return (
    <section className="panel">
      <div className="border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Clock3 className="h-4 w-4 text-muted" aria-hidden="true" />
          Appels par heure
        </h2>
        <p className="text-xs text-muted">
          {total === 0
            ? `Aucune mission sur ${data.days} jours.`
            : `${formatNumber(total)} missions sur ${data.days} jours · pic vers ${hourLabel(peak)}`}
        </p>
      </div>
      {total > 0 && (
        <div className="grid gap-4 p-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid stroke={colors.line} vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: colors.muted }}
                  tickLine={false}
                  axisLine={{ stroke: colors.line }}
                  fontSize={10}
                  interval={2}
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
                    borderRadius: 8,
                    fontSize: 12,
                    color: colors.fg,
                  }}
                  labelStyle={{ color: colors.fg }}
                  itemStyle={{ color: colors.muted }}
                  formatter={(value) => [`${value ?? 0} mission(s)`, 'Appels']}
                />
                <Bar dataKey="count" fill={colors.info} radius={[4, 4, 0, 0]} maxBarSize={18} />
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
            <p className="eyebrow mb-2">Zones les plus actives</p>
            <ol className="space-y-1.5 text-xs">
              {data.zones.map((zone, index) => (
                <li key={`${zone.latitude},${zone.longitude}`} className="flex items-center justify-between gap-2">
                  <a
                    className="inline-flex items-center gap-1 text-fg hover:underline"
                    href={`https://www.openstreetmap.org/?mlat=${zone.latitude}&mlon=${zone.longitude}#map=15/${zone.latitude}/${zone.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin className="h-3 w-3 text-muted" aria-hidden="true" />
                    Zone {index + 1}
                  </a>
                  <span className="num text-muted">
                    {zone.count} · pic {hourLabel(zone.peak_hour)}
                    {zone.peak_hour === nextHour && (
                      <span className="ml-1 font-semibold text-warning">· l’heure qui vient</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  )
}
