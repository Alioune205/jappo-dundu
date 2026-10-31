import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import type { TriageAnswers, TriageAssessment, TriageProtocol } from '@/types/api'

/** Questions et consignes du tri (source unique : le backend). Elles changent rarement. */
export function useTriageProtocol() {
  return useQuery<TriageProtocol>({
    queryKey: QK.triageProtocol,
    queryFn: () => api.get<TriageProtocol>('/api/ambulances/triage/'),
    staleTime: Infinity,
  })
}

/** Priorité suggérée et consignes pour les réponses données. */
export function useTriageAssessment(answers: TriageAnswers) {
  const answered = Object.keys(answers).length > 0
  return useQuery<TriageAssessment>({
    queryKey: [...QK.triageAssessment, answers],
    queryFn: () => api.post<TriageAssessment>('/api/ambulances/triage/', { answers }),
    enabled: answered,
    staleTime: Infinity,
    placeholderData: (previous) => previous,
  })
}
