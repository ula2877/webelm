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
import CreateSuratQuotation from './pages/CreateSuratQuotation';
import ViewSuratQuotation from './pages/ViewSuratQuotation';
import SuratInvoice from './pages/SuratInvoice';
import CreateSuratInvoice from './pages/CreateSuratInvoice';
import ViewSuratInvoice from './pages/ViewSuratInvoice';
import SuratDeliveryNote from './pages/SuratDeliveryNote';
import CreateSuratDeliveryNote from './pages/CreateSuratDeliveryNote';
import ViewSuratDeliveryNote from './pages/ViewSuratDeliveryNote';
import SuratHandover from './pages/SuratHandover';
import CreateSuratHandover from './pages/CreateSuratHandover';
import ViewSuratHandover from './pages/ViewSuratHandover';
import SuratInspectionRequest from './pages/SuratInspectionRequest';
import CreateSuratInspectionRequest from './pages/CreateSuratInspectionRequest';
import ViewSuratInspectionRequest from './pages/ViewSuratInspectionRequest';
import SuratPaymentRequest from './pages/SuratPaymentRequest';
import CreateSuratPaymentRequest from './pages/CreateSuratPaymentRequest';
import ViewSuratPaymentRequest from './pages/ViewSuratPaymentRequest';
import SuratReceipt from './pages/SuratReceipt';
import CreateSuratReceipt from './pages/CreateSuratReceipt';
import ViewSuratReceipt from './pages/ViewSuratReceipt';
import Projek from './pages/Projek';
import CreateProjek from './pages/CreateProjek';
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
        <Route path="/letters/quotation/create" element={<CreateSuratQuotation />} />
        <Route path="/letters/quotation/:id/edit" element={<CreateSuratQuotation />} />
        <Route path="/letters/quotation/:id/view" element={<ViewSuratQuotation />} />
        <Route path="/letters/invoice" element={<SuratInvoice />} />
        <Route path="/letters/invoice/create" element={<CreateSuratInvoice />} />
        <Route path="/letters/invoice/:id/edit" element={<CreateSuratInvoice />} />
        <Route path="/letters/invoice/:id/view" element={<ViewSuratInvoice />} />
        <Route path="/letters/delivery-note" element={<SuratDeliveryNote />} />
        <Route path="/letters/delivery-note/create" element={<CreateSuratDeliveryNote />} />
        <Route path="/letters/delivery-note/:id/edit" element={<CreateSuratDeliveryNote />} />
        <Route path="/letters/delivery-note/:id/view" element={<ViewSuratDeliveryNote />} />
        <Route path="/letters/handover" element={<SuratHandover />} />
        <Route path="/letters/handover/create" element={<CreateSuratHandover />} />
        <Route path="/letters/handover/:id/edit" element={<CreateSuratHandover />} />
        <Route path="/letters/handover/:id/view" element={<ViewSuratHandover />} />
        <Route path="/letters/inspection-request" element={<SuratInspectionRequest />} />
        <Route path="/letters/inspection-request/create" element={<CreateSuratInspectionRequest />} />
        <Route path="/letters/inspection-request/:id/edit" element={<CreateSuratInspectionRequest />} />
        <Route path="/letters/inspection-request/:id/view" element={<ViewSuratInspectionRequest />} />
        <Route path="/letters/payment-request" element={<SuratPaymentRequest />} />
        <Route path="/letters/payment-request/create" element={<CreateSuratPaymentRequest />} />
        <Route path="/letters/payment-request/:id/edit" element={<CreateSuratPaymentRequest />} />
        <Route path="/letters/payment-request/:id/view" element={<ViewSuratPaymentRequest />} />
        <Route path="/letters/receipt" element={<SuratReceipt />} />
        <Route path="/letters/receipt/create" element={<CreateSuratReceipt />} />
        <Route path="/letters/receipt/:id/edit" element={<CreateSuratReceipt />} />
        <Route path="/letters/receipt/:id/view" element={<ViewSuratReceipt />} />
        <Route path="/projects" element={<Projek />} />
        <Route path="/projects/create" element={<CreateProjek />} />
        <Route path="/projects/:id/edit" element={<CreateProjek />} />
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
