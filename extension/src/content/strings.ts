import type { ExtStatus } from '@/shared/messages';

/** Every pt-BR text the in-page UI shows. */
export const T = {
  appName: 'Nexus Passwords',
  iconLabel: 'Nexus Passwords: preencher',
  close: 'Fechar',
  loading: 'Carregando…',
  notUnlocked: {
    locked: 'Seu cofre está bloqueado.',
    'signed-out': 'Você não está conectado ao Nexus Passwords.',
    'needs-server': 'Configure o servidor do Nexus Passwords.',
  } satisfies Record<Exclude<ExtStatus, 'unlocked'>, string>,
  unlock: 'Desbloquear Nexus Passwords',
  toolbarHint: 'Clique no ícone do Nexus Passwords na barra do navegador.',
  noRecords: 'Nenhum registro para este site',
  createRecord: 'Criar registro no Nexus Passwords',
  generate: 'Gerar senha forte',
  generateDetail: 'Preenche os campos de nova senha',
  noLogin: '(sem usuário)',
  fillRecord: (title: string, login: string) => (login ? `Preencher ${title} (${login})` : `Preencher ${title}`),
  useUsername: (login: string) => `Usar o usuário ${login}`,
  formGone: 'O formulário mudou. Clique no ícone novamente.',
  totpTitle: 'Código 2FA',
  expiresIn: (seconds: number) => `Expira em ${seconds} s`,
  copy: 'Copiar',
  fillCode: 'Preencher código',
  codeCopied: 'Código copiado',
  passwordCopied: 'Senha copiada',
  copyFailed: 'Não foi possível copiar',
  generatedTitle: 'Senha forte gerada',
  generatedHint: 'Preenchida nos campos de nova senha.',
  noLoginForm: 'Nenhum formulário de login encontrado nesta página.',
  reload: 'O Nexus Passwords foi atualizado. Recarregue a página.',
  noAnswer: 'O Nexus Passwords não respondeu. Tente novamente.',
  generic: 'Não foi possível concluir. Tente novamente.',
} as const;

/**
 * The text to show for a failure: the service worker's own pt-BR message (`send` throws it as is), or a pt-BR
 * replacement for Chrome's messaging errors (an orphaned script after an extension update, no receiver).
 */
export function errorText(e: unknown): string {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return T.reload;
  const message = e instanceof Error ? e.message : '';
  if (/extension context invalidated/i.test(message)) return T.reload;
  if (/could not establish connection|receiving end does not exist|message port closed/i.test(message)) return T.noAnswer;
  return message || T.generic;
}
