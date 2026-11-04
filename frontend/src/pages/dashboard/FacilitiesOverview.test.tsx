import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ambulance, bloodRequest, capacity, facility } from '@/test/fixtures'
import { FacilitiesOverview, NetworkStatus } from './FacilitiesOverview'
import { facilityRows } from './facilityRows'

const principal = facility({ id: 1, name: 'Hôpital Principal de Dakar' })
const fann = facility({ id: 2, name: 'CHU de Fann' })
const samu = facility({ id: 3, name: 'SAMU National 15', facility_type: 'ambulance_service', facility_type_display: "Service d'ambulances" })

const rows = facilityRows(
  [fann, samu, principal],
  [
    capacity({ id: 1, facility: principal, total_beds: 20, occupied_beds: 19 }),
    capacity({ id: 2, facility: fann, total_beds: 20, occupied_beds: 8 }),
  ],
  [bloodRequest({ facility: principal, urgency: 'critical' })],
  [ambulance({ id: 1, facility: samu }), ambulance({ id: 2, facility: samu, status: 'on_mission' })]
)

describe('Situation des établissements', () => {
  it('calcule lits, sang et ambulances par établissement, du plus tendu au plus calme', () => {
    expect(rows.map((r) => r.facility.name)).toEqual(['Hôpital Principal de Dakar', 'CHU de Fann', 'SAMU National 15'])
    const [hpd, chu, samuRow] = rows
    expect(hpd).toMatchObject({ availableBeds: 1, totalBeds: 20, saturatedServices: 1, criticalRequests: 1, level: 'alert' })
    expect(chu).toMatchObject({ availableBeds: 12, occupancy: 0.4, level: 'normal' })
    expect(samuRow).toMatchObject({ occupancy: null, ambulances: 2, availableAmbulances: 1 })
  })

  it("affiche une ligne par établissement, sans bouton d'action", () => {
    render(<FacilitiesOverview rows={rows} />)
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(screen.getByText('dont 1 vitale')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it("résume l'état du réseau et ses raisons", () => {
    render(<NetworkStatus rows={rows} criticalBloodCount={1} availableAmbulances={1} totalAmbulances={2} occupancy={0.68} />)
    expect(screen.getByRole('status')).toHaveTextContent('Alerte sur le réseau — 1 demande de sang vitale · 1 établissement saturé')
  })
})
