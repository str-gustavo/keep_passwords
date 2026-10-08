import { ExtError } from '@/shared/errors';
import { SwError } from '@/shared/messages';

/** Shown when something fails without a message written for the user. */
export const GENERIC_ERROR = 'Não foi possível concluir. Tente novamente.';
/** Shown for a failed exchange with the service worker or a browser API (e.g. "Could not establish connection"). */
export const TRANSPORT_ERROR = 'Não foi possível falar com a extensão. Tente novamente.';

/**
 * The text to show for a failure. Only messages written for the user are shown as is: a service worker `{ ok: false }`
 * answer (SwError, pt-BR, never carrying secrets) and the extension's own validation errors (ExtError). Any other Error
 * (transport, browser API, bug) gets a pt-BR message instead of its raw, usually English, text.
 */
export function errorText(e: unknown): string {
  if ((e instanceof SwError || e instanceof ExtError) && e.message) return e.message;
  return e instanceof Error ? TRANSPORT_ERROR : GENERIC_ERROR;
}
