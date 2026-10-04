/** Référentiels partagés avec le backend (ml/constants.py, sang/models.py). */
import type { Option } from '@/components/ui/SelectField'
import type { BloodGroup, RegionCode } from '@/types/api'

export const REGIONS: readonly Option<RegionCode>[] = [
  { value: 'dakar', label: 'Dakar' },
  { value: 'diourbel', label: 'Diourbel' },
  { value: 'fatick', label: 'Fatick' },
  { value: 'kaffrine', label: 'Kaffrine' },
  { value: 'kaolack', label: 'Kaolack' },
  { value: 'kedougou', label: 'Kédougou' },
  { value: 'kolda', label: 'Kolda' },
  { value: 'louga', label: 'Louga' },
  { value: 'matam', label: 'Matam' },
  { value: 'saint_louis', label: 'Saint-Louis' },
  { value: 'sedhiou', label: 'Sédhiou' },
  { value: 'tambacounda', label: 'Tambacounda' },
  { value: 'thies', label: 'Thiès' },
  { value: 'ziguinchor', label: 'Ziguinchor' },
]

export const BLOOD_GROUPS: readonly BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
