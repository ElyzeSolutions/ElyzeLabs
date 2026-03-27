import { QueryClient } from '@tanstack/react-query';

export function createDashboardQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false
      }
    }
  });
}

export const dashboardQueryClient = createDashboardQueryClient();
