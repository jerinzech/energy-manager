import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import HqPage from './pages/HqPage';
import LauncherPage from './pages/LauncherPage';
import Map3DPage from './pages/Map3DPage';
import SitePage from './pages/SitePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LauncherPage />} />
        <Route path="/map" element={<Map3DPage />} />
        <Route path="/sites/:siteId" element={<SitePage />} />
        <Route path="/hq" element={<HqPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
