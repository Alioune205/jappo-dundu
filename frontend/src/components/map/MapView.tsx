import React, { useEffect } from 'react'
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

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [center, zoom, map])
  return null
}

export const MapView: React.FC<MapViewProps> = ({
  facilities = [],
  ambulances = [],
  missions = [],
  center = DAKAR_CENTER,
  zoom = 12,
  height = '500px',
  selectedPoint,
  className = '',
}) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const tileBase = isDark
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'

  const tileRef = isDark
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'

  return (
    <div
      style={{ height }}
      className={`relative z-0 w-full overflow-hidden rounded-md border border-line bg-canvas ${className}`}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <ChangeView center={center} zoom={zoom} />

        {/* Couche de base Esri adaptative (Clair ou Sombre selon le thème) */}
        <TileLayer
          key={`base-${theme}`}
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          url={tileBase}
          maxZoom={16}
        />
        {/* Couche de référence pour les étiquettes de villes et axes routiers */}
        <TileLayer
          key={`ref-${theme}`}
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          url={tileRef}
          maxZoom={16}
        />

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
            <Marker key={`amb-${amb.id}`} position={[amb.latitude, amb.longitude]} icon={icon}>
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
    </div>
  )
}
