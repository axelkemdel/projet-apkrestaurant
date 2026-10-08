export interface ResolvedServerUrl {
  url: string;
  source: string;
}
export function resolveServerUrl(env?: Record<string, string | undefined>): ResolvedServerUrl | null;
