/** Shown when something fails without a message written for the user. */
export const GENERIC_ERROR = 'Não foi possível concluir. Tente novamente.';

/**
 * The text to show for a failed request. `send()` rejects with the service worker's pt-BR error string, which never
 * carries secrets (the SW maps anything unexpected to a generic message).
 */
export function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : GENERIC_ERROR;
}
