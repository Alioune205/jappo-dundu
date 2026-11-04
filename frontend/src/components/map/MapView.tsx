import React, { useEffect, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FacilitySummary, Ambulance, Mission } from '@/types/api'
import { DAKAR_CENTER } from '@/lib/constants'
import { useTheme } from '@/context/ThemeContext'

// Icônes vectorielles SVG professionnelles
const SVG_ICONS = {
  hospital: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v12"/><path d="M6 12h12"/><path d="M3 3h18v18H3z" stroke-width="1.5"/></svg>`,
  bloodBank: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  ambulance: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-2.308A1 1 0 0 0 16.446 9H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M8 8v4"/><path d="M6 10h4"/></svg>`,
  alert: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  pin: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
}

/**
 * Marqueur carré aux couleurs du thème. Le HTML est injecté dans le DOM : les
 * variables CSS (--critical, --ok…) suivent donc le thème sans recréer l'icône.
 */
function createMarkerIcon(color: string, svgContent: string, pulse = false): L.DivIcon {
  return L.divIcon({
    className: 'ops-marker',
    html: `
      <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
        ${
          pulse
            ? `<div class="live-pulse" style="position:absolute;inset:-3px;border-radius:4px;border:1px solid ${color};"></div>`
            : ''
        }
        <div style="width:22px;height:22px;border-radius:3px;background:var(--surface);border:1.5px solid ${color};display:flex;align-items:center;justify-content:center;color:${color};">
          ${svgContent}
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  })
}

const hospitalIcon = createMarkerIcon('var(--info)', SVG_ICONS.hospital)
const bloodBankIcon = createMarkerIcon('var(--critical)', SVG_ICONS.bloodBank)
const ambulanceAvailableIcon = createMarkerIcon('var(--ok)', SVG_ICONS.ambulance)
const ambulanceBusyIcon = createMarkerIcon('var(--warning)', SVG_ICONS.ambulance, true)
const ambulanceOfflineIcon = createMarkerIcon('var(--fg-subtle)', SVG_ICONS.ambulance)
const missionIcon = createMarkerIcon('var(--critical)', SVG_ICONS.alert, true)
const selectedIcon = createMarkerIcon('var(--fg)', SVG_ICONS.pin)

interface MapViewProps {
  facilities?: FacilitySummary[]
  ambulances?: Ambulance[]
  missions?: Mission[]
  center?: [number, number]
  zoom?: number
  height?: string
  selectedPoint?: [number, number] | null
  className?: string
}

/** Le Sénégal, avec une marge : on ne peut pas dézoomer ni glisser au-delà. */
const SENEGAL_BOUNDS = L.latLngBounds([11.8, -18.4], [17.2, -10.9])
/** Zoom maximal d'un cadrage automatique : le quartier, pas la rue. */
const FIT_MAX_ZOOM = 13

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [center, zoom, map])
  return null
}

/**
 * Cadre la carte sur les marqueurs affichés. Le cadrage n'est refait que si la
 * liste des marqueurs change (pas à chaque position GPS), pour ne pas déplacer
 * la carte sous les yeux de l'opérateur.
 */
function FitToPoints({ points, signature, recenter }: { points: [number, number][]; signature: string; recenter: number }) {
  const map = useMap()
  const pointsRef = useRef(points)
  useEffect(() => {
    pointsRef.current = points
  })
  // Tant que l'opérateur n'a pas déplacé la carte, on recadre aussi quand sa
  // taille change (panneau qui finit de s'ouvrir, fenêtre redimensionnée).
  const userMoved = useRef(false)

  useEffect(() => {
    const fit = () => {
      const pts = pointsRef.current
      if (pts.length === 0) map.setView(DAKAR_CENTER, 12)
      else if (pts.length === 1) map.setView(pts[0], FIT_MAX_ZOOM)
      else map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: FIT_MAX_ZOOM })
    }
    const onResize = () => {
      if (!userMoved.current) fit()
    }
    const onDrag = () => {
      userMoved.current = true
    }
    userMoved.current = false
    fit()
    map.on('resize', onResize)
    map.on('dragstart', onDrag)
    return () => {
      map.off('resize', onResize)
      map.off('dragstart', onDrag)
    }
  }, [signature, recenter, map])
  return null
}

/** Recalcule la taille de la carte quand son conteneur change (sinon : tuiles grises). */
function AutoResize() {
  const map = useMap()
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

export const MapView: React.FC<MapViewProps> = ({
  facilities = [],
  ambulances = [],
  missions = [],
  center,
  zoom = 12,
  height = '500px',
  selectedPoint,
  className = '',
}) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [recenter, setRecenter] = useState(0)

  // Fond Esri gris (clair ou sombre selon le thème) + couche des noms de lieux.
  const esri = (layer: string) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${isDark ? 'Dark' : 'Light'}_Gray_${layer}/MapServer/tile/{z}/{y}/{x}`

  // Sans centre imposé, la carte se cadre sur ce qu'elle affiche.
  const points: [number, number][] = [
    ...facilities.filter((f) => f.latitude && f.longitude).map((f) => [f.latitude!, f.longitude!] as [number, number]),
    ...ambulances.filter((a) => a.latitude && a.longitude).map((a) => [a.latitude!, a.longitude!] as [number, number]),
    ...missions
      .filter((m) => m.pickup_latitude && m.pickup_longitude)
      .map((m) => [m.pickup_latitude!, m.pickup_longitude!] as [number, number]),
    ...(selectedPoint ? [selectedPoint] : []),
  ]
  const signature = [
    ...facilities.map((f) => `f${f.id}`),
    ...ambulances.map((a) => `a${a.id}`),
    ...missions.map((m) => `m${m.id}`),
    selectedPoint ? 'sel' : '',
  ].join(',')

  return (
    <div
      style={{ height }}
      className={`relative z-0 w-full overflow-hidden rounded-md border border-line bg-canvas ${className}`}
    >
      <MapContainer
        center={center ?? DAKAR_CENTER}
        zoom={zoom}
        minZoom={6}
        maxBounds={SENEGAL_BOUNDS}
        maxBoundsViscosity={0.8}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        {center ? (
          <ChangeView center={center} zoom={zoom} />
        ) : (
          <FitToPoints points={points} signature={signature} recenter={recenter} />
        )}
        <AutoResize />

        <TileLayer
          key={`base-${theme}`}
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          url={esri('Base')}
          maxZoom={16}
        />
        <TileLayer key={`ref-${theme}`} url={esri('Reference')} maxZoom={16} />

        {/* Établissements de santé */}
        {facilities.map((facility) => {
          if (!facility.latitude || !facility.longitude) return null
          const isBloodBank = facility.facility_type === 'blood_bank'

          return (
            <Marker
              key={`fac-${facility.id}`}
              position={[facility.latitude, facility.longitude]}
              icon={isBloodBank ? bloodBankIcon : hospitalIcon}
            >
              <Popup>
                <div className="min-w-[200px] space-y-1">
                  <div className="eyebrow flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${isBloodBank ? 'bg-critical' : 'bg-info'}`} />
                    {facility.facility_type_display}
                  </div>
                  <div className="text-sm font-medium leading-snug text-fg">{facility.name}</div>
                  <div className="text-muted">
                    {facility.city}
                    {facility.region && ` · ${facility.region}`}
                  </div>
                  {facility.phone_number && (
                    <a href={`tel:${facility.phone_number}`} className="num inline-block pt-0.5 text-info hover:underline">
                      {facility.phone_number}
                    </a>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Flotte d'ambulances */}
        {ambulances.map((amb) => {
          if (!amb.latitude || !amb.longitude) return null
          let icon = ambulanceAvailableIcon
          if (amb.status === 'on_mission') icon = ambulanceBusyIcon
          else if (amb.status === 'out_of_service') icon = ambulanceOfflineIcon
          const dot =
            amb.status === 'available' ? 'bg-ok' : amb.status === 'on_mission' ? 'bg-warning' : 'bg-subtle'

          return (
            // Au-dessus des établissements : une ambulance à sa base reste visible.
            <Marker key={`amb-${amb.id}`} position={[amb.latitude, amb.longitude]} icon={icon} zIndexOffset={500}>
              <Popup>
                <div className="min-w-[190px] space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="num font-medium text-fg">{amb.plate_number}</span>
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                      {amb.status_display}
                    </span>
                  </div>
                  <div className="text-muted">{amb.ambulance_type_display}</div>
                  {amb.driver && (
                    <div className="text-muted">
                      Chauffeur : <span className="text-fg">{amb.driver.full_name}</span>
                    </div>
                  )}
                  {amb.facility && (
                    <div className="border-t border-line pt-1 text-subtle">{amb.facility.name}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Missions d'urgence en cours */}
        {missions.map((mission) => {
          if (!mission.pickup_latitude || !mission.pickup_longitude) return null
          return (
            <Marker
              key={`mis-${mission.id}`}
              position={[mission.pickup_latitude, mission.pickup_longitude]}
              icon={missionIcon}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="min-w-[210px] space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="num font-medium text-fg">Mission #{mission.id}</span>
                    <span className="font-medium text-critical">{mission.priority_display}</span>
                  </div>
                  <div className="text-fg">{mission.pickup_address}</div>
                  <div className="text-muted">
                    Statut : <span className="text-fg">{mission.status_display}</span>
                  </div>
                  {mission.ambulance && (
                    <div className="text-muted">
                      Véhicule : <span className="num text-fg">{mission.ambulance.plate_number}</span>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Point sélectionné manuellement */}
        {selectedPoint && (
          <Marker position={selectedPoint} icon={selectedIcon}>
            <Popup>
              <div className="font-medium text-fg">Position sélectionnée</div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {!center && points.length > 0 && (
        <button
          type="button"
          onClick={() => setRecenter((n) => n + 1)}
          className="absolute right-3 top-3 z-[1000] inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-fg shadow-[var(--shadow-panel)] hover:bg-raised"
          title="Recadrer la carte sur les éléments affichés"
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" /> Recentrer
        </button>
      )}
    </div>
  )
}
