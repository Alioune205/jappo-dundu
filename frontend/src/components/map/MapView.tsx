import React, { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FacilitySummary, Ambulance, Mission } from '@/types/api'
import { DAKAR_CENTER } from '@/lib/constants'
import { useTheme } from '@/context/ThemeContext'

// Icônes vectorielles SVG professionnelles
const SVG_ICONS = {
  hospital: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v12"/><path d="M6 12h12"/><path d="M3 3h18v18H3z" stroke-width="1.5"/></svg>`,
  bloodBank: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  ambulance: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-2.308A1 1 0 0 0 16.446 9H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M8 8v4"/><path d="M6 10h4"/></svg>`,
  alert: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  pin: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
}

function createMarkerIcon(color: string, svgContent: string, pulse = false): L.DivIcon {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        ${
          pulse
            ? `<div style="position: absolute; inset: -4px; border-radius: 9999px; background-color: ${color}; opacity: 0.3; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
            : ''
        }
        <div style="width: 28px; height: 28px; border-radius: 8px; background: #ffffff; border: 2px solid ${color}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); color: ${color};">
          ${svgContent}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  })
}

const hospitalIcon = createMarkerIcon('#0284c7', SVG_ICONS.hospital)
const bloodBankIcon = createMarkerIcon('#dc2626', SVG_ICONS.bloodBank)
const ambulanceAvailableIcon = createMarkerIcon('#059669', SVG_ICONS.ambulance)
const ambulanceBusyIcon = createMarkerIcon('#d97706', SVG_ICONS.ambulance, true)
const ambulanceOfflineIcon = createMarkerIcon('#64748b', SVG_ICONS.ambulance)
const missionIcon = createMarkerIcon('#dc2626', SVG_ICONS.alert, true)

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
      className={`w-full rounded-xl overflow-hidden border border-[var(--border-main)] bg-[var(--bg-canvas)] shadow-xs relative z-0 ${className}`}
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
          const icon = isBloodBank ? bloodBankIcon : hospitalIcon

          return (
            <Marker key={`fac-${facility.id}`} position={[facility.latitude, facility.longitude]} icon={icon}>
              <Popup>
                <div className="space-y-1.5 p-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isBloodBank ? 'bg-rose-600' : 'bg-sky-600'
                      }`}
                    />
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">
                      {facility.facility_type_display}
                    </span>
                  </div>
                  <div className="font-bold text-[var(--text-main)] text-sm leading-snug">
                    {facility.name}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {facility.city} {facility.region && `(${facility.region.toUpperCase()})`}
                  </div>
                  {facility.phone_number && (
                    <a
                      href={`tel:${facility.phone_number}`}
                      className="inline-flex items-center gap-1.5 text-xs text-sky-600 font-semibold hover:underline pt-1"
                    >
                      <span>📞</span> {facility.phone_number}
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

          return (
            <Marker key={`amb-${amb.id}`} position={[amb.latitude, amb.longitude]} icon={icon}>
              <Popup>
                <div className="space-y-1.5 p-1 min-w-[190px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-xs text-amber-600">
                      {amb.plate_number}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        amb.status === 'available'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : amb.status === 'on_mission'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {amb.status_display}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-main)]">{amb.ambulance_type_display}</div>
                  {amb.driver && (
                    <div className="text-xs text-[var(--text-muted)]">
                      Chauffeur : <span className="text-[var(--text-main)] font-medium">{amb.driver.full_name}</span>
                    </div>
                  )}
                  {amb.facility && (
                    <div className="text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-1">
                      {amb.facility.name}
                    </div>
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
                <div className="space-y-1.5 p-1 min-w-[210px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-rose-600">Intervention #{mission.id}</span>
                    <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      {mission.priority_display}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-main)] font-medium">{mission.pickup_address}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Statut : <span className="text-[var(--text-main)]">{mission.status_display}</span>
                  </div>
                  {mission.ambulance && (
                    <div className="text-xs text-emerald-600 font-mono font-bold pt-0.5">
                      Véhicule assigné : {mission.ambulance.plate_number}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Point sélectionné manuellement */}
        {selectedPoint && (
          <Marker position={selectedPoint} icon={createMarkerIcon('#7c3aed', SVG_ICONS.pin, true)}>
            <Popup>
              <div className="text-xs font-semibold text-purple-700 p-1">Position sélectionnée</div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}
