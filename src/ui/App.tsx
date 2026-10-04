import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TopBar } from './components/TopBar';
import { CompaniesPage } from './pages/CompaniesPage';
import { ListingPage } from './pages/ListingPage';
import { SearchPage } from './pages/SearchPage';

export function App() {
  return (
    <HashRouter>
      <TopBar />
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/search" replace />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/listing/:id" element={<ListingPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
