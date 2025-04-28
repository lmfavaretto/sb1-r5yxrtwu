import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { Dashboard } from './pages/Dashboard';
import { Upload } from './pages/Upload';
import { RFMMatrix } from './pages/RFMMatrix';
import { DeliveryGuru } from './pages/DeliveryGuru';
import { WhatsApp } from './pages/WhatsApp';
import { WhatsAppCallback } from './pages/whatsapp/callback';
import { AutoCampaign } from './pages/whatsapp/AutoCampaign';
import { Settings } from './pages/Settings';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <Upload />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matriz-rfm"
          element={
            <ProtectedRoute>
              <RFMMatrix />
            </ProtectedRoute>
          }
        />
        <Route
          path="/guru"
          element={
            <ProtectedRoute>
              <DeliveryGuru />
            </ProtectedRoute>
          }
        />
        <Route
          path="/whatsapp"
          element={
            <ProtectedRoute>
              <WhatsApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/whatsapp/campaigns/auto"
          element={
            <ProtectedRoute>
              <AutoCampaign />
            </ProtectedRoute>
          }
        />
        <Route
          path="/whatsapp/callback"
          element={
            <ProtectedRoute>
              <WhatsAppCallback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster position="top-right" />
    </>
  );
}

export default App;