import React, { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FacilitySummary, Ambulance, Mission } from '@/types/api'
import { DAKAR_CENTER } from '@/lib/constants'

// Définition des icônes SVG custom pour éviter le bug des images manquantes de Leaflet
function createMarkerIcon(color: string, iconChar: string, pulse = false): L.DivIcon {
  return L.divIcon({
    className: 'map-pin',
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        ${
          pulse
            ? `<div style="position: absolute; width: 34px; height: 34px; border-radius: 9999px; background-color: ${color}; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
            : ''
        }
        <div style="width: 28px; height: 28px; border-radius: 9999px; background: #0b1220; border: 2px solid ${color}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 13px; font-weight: bold; color: ${color};">
          ${iconChar}
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })
}

const hospitalIcon = createMarkerIcon('#38bdf8', '🏥')
const bloodBankIcon = createMarkerIcon('#f43f5e', '🩸')
const ambulanceAvailableIcon = createMarkerIcon('#34d399', '🚑')
const ambulanceBusyIcon = createMarkerIcon('#fbbf24', '🚨', true)
const ambulanceOfflineIcon = createMarkerIcon('#64748b', '🚑')
const missionIcon = createMarkerIcon('#f43f5e', '⚠️', true)

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
  return (
    <div
      style={{ height }}
      className={`w-full rounded-2xl overflow-hidden border border-white/10 shadow-glow relative z-0 ${className}`}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%', background: '#0b1220' }}
      >
        <ChangeView center={center} zoom={zoom} />
        {/* Tuile sombre CartoDB Dark Matter */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Établissements de santé */}
        {facilities.map((facility) => {
          if (!facility.latitude || !facility.longitude) return null
          const icon = facility.facility_type === 'blood_bank' ? bloodBankIcon : hospitalIcon
          return (
            <Marker key={`fac-${facility.id}`} position={[facility.latitude, facility.longitude]} icon={icon}>
              <Popup>
                <div className="space-y-1">
                  <div className="font-semibold text-ink-100">{facility.name}</div>
                  <div className="text-xs text-ink-400">
                    {facility.facility_type_display} • {facility.city}
                  </div>
                  {facility.phone_number && (
                    <div className="text-xs text-sky-400 font-medium">{facility.phone_number}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Ambulances */}
        {ambulances.map((amb) => {
          if (!amb.latitude || !amb.longitude) return null
          let icon = ambulanceAvailableIcon
          if (amb.status === 'on_mission') icon = ambulanceBusyIcon
          else if (amb.status === 'out_of_service') icon = ambulanceOfflineIcon

          return (
            <Marker key={`amb-${amb.id}`} position={[amb.latitude, amb.longitude]} icon={icon}>
              <Popup>
                <div className="space-y-1">
                  <div className="font-semibold text-ink-100">Ambulance {amb.plate_number}</div>
                  <div className="text-xs text-ink-400">
                    {amb.ambulance_type_display} • {amb.status_display}
                  </div>
                  {amb.driver && (
                    <div className="text-xs text-ink-300">Conducteur : {amb.driver.full_name}</div>
                  )}
                  {amb.facility && (
                    <div className="text-xs text-ink-500">Rattachée à : {amb.facility.name}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Missions en cours */}
        {missions.map((mission) => {
          if (!mission.pickup_latitude || !mission.pickup_longitude) return null
          return (
            <Marker
              key={`mis-${mission.id}`}
              position={[mission.pickup_latitude, mission.pickup_longitude]}
              icon={missionIcon}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="font-bold text-rose-400">🚨 Urgence #{mission.id}</div>
                  <div className="text-xs font-medium text-ink-200">{mission.pickup_address}</div>
                  <div className="text-xs text-ink-400">
                    Priorité: {mission.priority_display} • Statut: {mission.status_display}
                  </div>
                  {mission.ambulance && (
                    <div className="text-xs text-emerald-400 font-semibold">
                      Ambulance : {mission.ambulance.plate_number}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Point sélectionné manuellement */}
        {selectedPoint && (
          <Marker position={selectedPoint} icon={createMarkerIcon('#a855f7', '📍', true)}>
            <Popup>
              <div className="text-xs font-semibold text-purple-300">Point sélectionné</div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}
