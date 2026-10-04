import type { Flag } from '../../domain/types';
import { t } from '../i18n';

/** A data mismatch is yellow "Clarify your data" first, red "Data not confirmed" after the grace period. */
export function flagLabel(flag: Pick<Flag, 'kind' | 'level'>): string {
  return flag.kind === 'data_mismatch' && flag.level === 'yellow' ? t('flag.data_mismatch.yellow') : t(`flag.${flag.kind}`);
}

export function FlagBadge({ flag }: { flag: Flag }) {
  return <span className={`badge badge-${flag.level}`}>{flagLabel(flag)}</span>;
}
