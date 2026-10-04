// A company hidden after 6 months without login returns by confirming its contacts (TZ).
import { confirmContactData } from '../../domain/commands/moderation';
import { store, useAppState } from '../../store/store';
import { t } from '../i18n';

export function InactiveBanner() {
  const state = useAppState((s) => s);
  const actor = state.companies.find((c) => c.id === state.actorId);
  if (!actor || actor.status !== 'deactivated') return null;
  return (
    <div className="alert alert-yellow banner">
      {t('inactive.banner')}{' '}
      <button className="btn btn-small btn-primary" onClick={() => store.run(confirmContactData)}>{t('inactive.confirm')}</button>
    </div>
  );
}
