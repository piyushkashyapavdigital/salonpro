import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ADMIN_ROLES } from '@salonpro/shared';
import { useAuth } from './lib/auth';
import { isAdminApp } from './lib/mode';
import { initBackButton, initNativeChrome, isNative } from './lib/native';
import { useToast } from './components/Toast';
import { AdminShell, CustomerShell } from './components/layout';
import { EmptyState, Spinner } from './components/ui';

import Landing from './pages/Landing';
import Login from './pages/Login';

import Home from './pages/customer/Home';
import Services from './pages/customer/Services';
import Book from './pages/customer/Book';
import Bookings from './pages/customer/Bookings';
import WalletPage from './pages/customer/Wallet';
import Referrals from './pages/customer/Referrals';
import Offers from './pages/customer/Offers';
import Profile from './pages/customer/Profile';
import Notifications from './pages/customer/Notifications';

import Dashboard from './pages/admin/Dashboard';
import Appointments from './pages/admin/Appointments';
import Customers from './pages/admin/Customers';
import ServicesAdmin from './pages/admin/ServicesAdmin';
import WalletAdmin from './pages/admin/WalletAdmin';
import PaymentsAdmin from './pages/admin/PaymentsAdmin';
import ReferralsAdmin from './pages/admin/ReferralsAdmin';
import RemindersAdmin from './pages/admin/RemindersAdmin';
import StaffAdmin from './pages/admin/StaffAdmin';
import BranchesAdmin from './pages/admin/BranchesAdmin';
import ReportsAdmin from './pages/admin/ReportsAdmin';
import SettingsAdmin from './pages/admin/SettingsAdmin';

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 text-ink-400">
      <Spinner size={26} />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!ADMIN_ROLES.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
        <div className="card w-full max-w-md">
          <EmptyState
            icon="🔒"
            title="Dashboard access only"
            description="Your account is a customer account. The owner dashboard is restricted to salon staff — this restriction is enforced on the server, not just here."
          />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Owner dashboard + staff console routes. Shared by both builds — the customer
 * build reaches them under `/admin`, the admin build is *only* them.
 */
const ADMIN_CHILDREN = [
  <Route key="dashboard" index element={<Dashboard />} />,
  <Route key="appointments" path="appointments" element={<Appointments />} />,
  <Route key="customers" path="customers" element={<Customers />} />,
  <Route key="services" path="services" element={<ServicesAdmin />} />,
  <Route key="payments" path="payments" element={<WalletAdmin />} />,
  <Route key="refunds" path="payments/refunds" element={<PaymentsAdmin />} />,
  <Route key="referrals" path="referrals" element={<ReferralsAdmin />} />,
  <Route key="reminders" path="reminders" element={<RemindersAdmin />} />,
  <Route key="staff" path="staff" element={<StaffAdmin />} />,
  <Route key="branches" path="branches" element={<BranchesAdmin />} />,
  <Route key="reports" path="reports" element={<ReportsAdmin />} />,
  <Route key="settings" path="settings" element={<SettingsAdmin />} />,
];

const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
    <div className="card w-full max-w-md">
      <EmptyState
        icon="🧭"
        title="Page not found"
        description="That link does not exist. Head back to the app to continue."
        action={
          <a className="btn-primary" href="/">
            Back to SalonPro
          </a>
        }
      />
    </div>
  </div>
);

export default function App() {
  const { user, loading } = useAuth();
  const toast = useToast();

  // Native app chrome: status bar, splash hand-off and the hardware back button.
  useEffect(() => {
    void initNativeChrome();
    let dispose = () => {};
    void initBackButton(() => toast.info('Press back again to exit')).then((fn) => {
      dispose = fn;
    });
    return () => dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Admin build (`VITE_APP_MODE=admin`): dashboard only.
  // No landing page and no customer app — everything funnels to /admin.
  // ------------------------------------------------------------------
  if (isAdminApp) {
    return (
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/admin" replace /> : <Login />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminShell />
            </RequireAdmin>
          }
        >
          {ADMIN_CHILDREN}
        </Route>
        <Route
          path="*"
          element={loading ? <FullPageSpinner /> : <Navigate to={user ? '/admin' : '/login'} replace />}
        />
      </Routes>
    );
  }

  // ------------------------------------------------------------------
  // Customer build: marketing site on the web, straight into the app on
  // a device (an APK should never boot into a marketing page).
  // ------------------------------------------------------------------
  const nativeBoot = isNative();
  const homeFor = (role?: string) => (role === 'customer' ? '/app' : '/admin');

  return (
    <Routes>
      <Route
        path="/"
        element={
          loading ? (
            <FullPageSpinner />
          ) : user ? (
            <Navigate to={homeFor(user.role)} replace />
          ) : nativeBoot ? (
            <Navigate to="/login" replace />
          ) : (
            <Landing />
          )
        }
      />
      <Route path="/join/:code" element={<Landing />} />
      <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Login />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <CustomerShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="services" element={<Services />} />
        <Route path="book" element={<Book />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="referrals" element={<Referrals />} />
        <Route path="offers" element={<Offers />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminShell />
          </RequireAdmin>
        }
      >
        {ADMIN_CHILDREN}
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
