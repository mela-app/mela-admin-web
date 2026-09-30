import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../lib/api'
import { createAppRouter } from './router'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // A refusal (4xx) won't change on retry; a network blip or a 5xx might.
      retry: (failures, error) =>
        failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
    mutations: { retry: false },
  },
})

export const router = createAppRouter(queryClient)
