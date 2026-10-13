import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { InactiveBanner } from './components/InactiveBanner';
import { TopBar } from './components/TopBar';
import { getLanguage, subscribeLanguage } from './i18n';
import { AccountPage } from './pages/AccountPage';
import { BalancePage } from './pages/BalancePage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyPage } from './pages/CompanyPage';
import { EventsPage } from './pages/EventsPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ListingPage } from './pages/ListingPage';
import { ModerationPage } from './pages/ModerationPage';
import { MyListingsPage } from './pages/MyListingsPage';
import { PostListingPage } from './pages/PostListingPage';
import { RegisterPage } from './pages/RegisterPage';
import { SearchPage } from './pages/SearchPage';

export function App() {
  // t() reads the current language; subscribing here re-renders the whole tree when it changes.
  useSyncExternalStore(subscribeLanguage, getLanguage);
  return (
    <HashRouter>
      <TopBar />
      <main className="page">
        <InactiveBanner />
        <Routes>
          <Route path="/" element={<Navigate to="/search" replace />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/listing/:id" element={<PerId><ListingPage /></PerId>} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/company/:id" element={<PerId><CompanyPage /></PerId>} />
          <Route path="/post" element={<PostListingPage />} />
          <Route path="/edit/:id" element={<PerId><PostListingPage key="edit" /></PerId>} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/my-listings" element={<MyListingsPage />} />
          <Route path="/balance" element={<BalancePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/moderation" element={<ModerationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </HashRouter>
  );
}

/**
 * Pages with an :id keep no state across ids: moving from one listing or company to another
 * starts fresh (otherwise e.g. an open "Open anyway" confirmation would carry over).
 */
function PerId({ children }: { children: ReactNode }) {
  const { id } = useParams();
  return <Fragment key={id}>{children}</Fragment>;
}
