import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as ptBr from '@zxcvbn-ts/language-pt-br';

const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...ptBr.dictionary },
  graphs: common.adjacencyGraphs,
  translations: ptBr.translations,
});

const LABELS = ['Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte'] as const;

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: LABELS[0] };
  const score = zxcvbn.check(pw.slice(0, 100)).score as 0 | 1 | 2 | 3 | 4;
  return { score, label: LABELS[score] };
}
