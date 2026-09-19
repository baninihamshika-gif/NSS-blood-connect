import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { MissingSupabaseConfig } from '@/components/ui/MissingSupabaseConfig'
import { isSupabaseConfigured } from '@/lib/env'
import { LandingPage } from '@/pages/public/LandingPage'
import { LoginPage } from '@/pages/public/LoginPage'
import { RegisterPage } from '@/pages/public/RegisterPage'
import { ForgotPasswordPage } from '@/pages/public/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/public/ResetPasswordPage'
import { NotFoundPage } from '@/pages/public/NotFoundPage'
import { DonorDashboardPage } from '@/pages/donor/DonorDashboardPage'
import { DonorProfilePage } from '@/pages/donor/DonorProfilePage'
import { DonorRequestDetailsPage } from '@/pages/donor/DonorRequestDetailsPage'
import { RequesterDashboardPage } from '@/pages/requester/RequesterDashboardPage'
import { CreateRequestPage } from '@/pages/requester/CreateRequestPage'
import { EmergencyRequestPage } from '@/pages/requester/EmergencyRequestPage'
import { RequestHistoryPage } from '@/pages/requester/RequestHistoryPage'
import { RequestDetailsPage } from '@/pages/requester/RequestDetailsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<DashboardLayout />}>
        <Route
          path="/donor/dashboard"
          element={
            <ProtectedRoute allowedRole="DONOR">
              <DonorDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/donor/profile"
          element={
            <ProtectedRoute allowedRole="DONOR">
              <DonorProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/donor/matches/:matchId"
          element={
            <ProtectedRoute allowedRole="DONOR">
              <DonorRequestDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requester/dashboard"
          element={
            <ProtectedRoute allowedRole="REQUESTER">
              <RequesterDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requester/requests/new"
          element={
            <ProtectedRoute allowedRole="REQUESTER">
              <CreateRequestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requester/requests/emergency"
          element={
            <ProtectedRoute allowedRole="REQUESTER">
              <EmergencyRequestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requester/requests"
          element={
            <ProtectedRoute allowedRole="REQUESTER">
              <RequestHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requester/requests/:id"
          element={
            <ProtectedRoute allowedRole="REQUESTER">
              <RequestDetailsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}

function App() {
  if (!isSupabaseConfigured) {
    return <MissingSupabaseConfig />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
