import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import CreateUser from './pages/CreateUser';
import EditUser from './pages/EditUser';
import SuratOverview from './pages/SuratOverview';
import SuratQuotation from './pages/SuratQuotation';
import SuratInvoice from './pages/SuratInvoice';
import SuratDeliveryNote from './pages/SuratDeliveryNote';
import SuratHandover from './pages/SuratHandover';
import SuratInspectionRequest from './pages/SuratInspectionRequest';
import SuratPaymentRequest from './pages/SuratPaymentRequest';
import SuratReceipt from './pages/SuratReceipt';
import Profile from './pages/Profile';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">Checking authentication...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/create" element={<CreateUser />} />
        <Route path="/users/:id/edit" element={<EditUser />} />
        <Route path="/letters" element={<SuratOverview />} />
        <Route path="/letters/quotation" element={<SuratQuotation />} />
        <Route path="/letters/invoice" element={<SuratInvoice />} />
        <Route path="/letters/delivery-note" element={<SuratDeliveryNote />} />
        <Route path="/letters/handover" element={<SuratHandover />} />
        <Route path="/letters/inspection-request" element={<SuratInspectionRequest />} />
        <Route path="/letters/payment-request" element={<SuratPaymentRequest />} />
        <Route path="/letters/receipt" element={<SuratReceipt />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
