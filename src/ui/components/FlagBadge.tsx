import type { Flag } from '../../domain/types';
import { t } from '../i18n';

export function FlagBadge({ flag }: { flag: Flag }) {
  return <span className={`badge badge-${flag.level}`}>{t(`flag.${flag.kind}`)}</span>;
}
