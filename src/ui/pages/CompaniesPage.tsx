import { Link } from 'react-router-dom';
import { loginAs } from '../../domain/commands/session';
import { activeFlags } from '../../domain/rules/flags';
import { balanceOf } from '../../domain/rules/ledger';
import { MODERATOR_ID } from '../../domain/types';
import { SEED_META } from '../../seed';
import { store, useAppState } from '../../store/store';
import { FlagBadge } from '../components/FlagBadge';
import { formatMoney } from '../format';
import { t } from '../i18n';

export function CompaniesPage() {
  const state = useAppState((s) => s);
  const login = (id: string) => store.run((s) => loginAs(s, id));

  return (
    <section>
      <h1>{t('companies.title')}</h1>
      <p className="muted">{t('companies.hint')}</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('companies.col.company')}</th>
              <th>{t('companies.col.role')}</th>
              <th>{t('companies.col.country')}</th>
              <th className="num">{t('companies.col.balance')}</th>
              <th>{t('companies.col.flags')}</th>
              <th>{t('companies.col.scenario')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.companies.map((c) => (
              <tr key={c.id} className={c.id === state.actorId ? 'row-current' : undefined}>
                <td>
                  <Link to={`/company/${c.id}`}>{c.legalName}</Link>
                  <div className="muted small">
                    {c.id} · {c.regNumberType} {c.regNumber}
                  </div>
                </td>
                <td>{t(`role.${c.role}`)}</td>
                <td>{c.country}</td>
                <td className="num">{formatMoney(balanceOf(state.transactions, c.id))}</td>
                <td>
                  {activeFlags(state.flags, c.id).map((f) => (
                    <FlagBadge key={f.id} flag={f} />
                  ))}
                </td>
                <td className="small">{SEED_META.notes[c.id]}</td>
                <td>
                  {c.id === state.actorId ? (
                    <span className="muted small">{t('companies.current')}</span>
                  ) : (
                    <button className="btn" onClick={() => login(c.id)}>
                      {t('companies.loginButton')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr className={state.actorId === MODERATOR_ID ? 'row-current' : undefined}>
              <td>{t('role.moderator')}</td>
              <td>—</td>
              <td>—</td>
              <td className="num">—</td>
              <td />
              <td className="small">{t('companies.moderatorNote')}</td>
              <td>
                {state.actorId === MODERATOR_ID ? (
                  <span className="muted small">{t('companies.current')}</span>
                ) : (
                  <button className="btn" onClick={() => login(MODERATOR_ID)}>
                    {t('companies.loginButton')}
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
