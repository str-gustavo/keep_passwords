import { beforeEach, describe, expect, it } from 'vitest';
import { GENERIC_ERROR, TRANSPORT_ERROR, errorText } from '@/popup/lib/errors';
import { ExtError } from '@/shared/errors';
import { SwError, send } from '@/shared/messages';
import { NO_RECEIVER_ERROR, getChromeMock, resetChromeMock } from './helpers/chrome-mock';

beforeEach(() => resetChromeMock());

describe('send', () => {
  it('throws a SwError with the service worker message, unchanged, on { ok: false }', async () => {
    getChromeMock().runtime.onMessage.addListener((_m: unknown, _s: unknown, reply: (r: unknown) => void) => reply({ ok: false, error: 'Registro não corresponde a este site' }));
    const err = await send({ type: 'getState' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SwError);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Registro não corresponde a este site');
  });

  it('lets a transport failure through as a plain Error', async () => {
    const err = await send({ type: 'getState' }).catch((e: unknown) => e); // no listener: "Receiving end does not exist"
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SwError);
    expect((err as Error).message).toBe(NO_RECEIVER_ERROR);
  });
});

describe('errorText', () => {
  it('shows service worker and local validation messages as written', () => {
    expect(errorText(new SwError('Senha mestra incorreta'))).toBe('Senha mestra incorreta');
    expect(errorText(new ExtError('Endereço do servidor inválido.'))).toBe('Endereço do servidor inválido.');
  });

  it('hides transport and unexpected errors behind a pt-BR message', () => {
    expect(TRANSPORT_ERROR).toBe('Não foi possível falar com a extensão. Tente novamente.');
    expect(errorText(new Error(NO_RECEIVER_ERROR))).toBe(TRANSPORT_ERROR);
    expect(errorText(new TypeError('x is not a function'))).toBe(TRANSPORT_ERROR);
    expect(errorText('boom')).toBe(GENERIC_ERROR);
    expect(errorText(undefined)).toBe(GENERIC_ERROR);
  });
});
