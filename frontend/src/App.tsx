import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { websocketService } from '@/services/websocketService'
import LoginPage from '@/pages/LoginPage'
import DashboardLayout from '@/components/layout/DashboardLayout'
import DashboardPage from '@/pages/DashboardPage'
import ShiftsPage from '@/pages/ShiftsPage'
import VehiclesPage from '@/pages/VehiclesPage'
import VehicleDetailPage from '@/pages/VehicleDetailPage'
import MessagesPage from '@/pages/MessagesPage'
import SettingsPage from '@/pages/SettingsPage'
import TasksPage from '@/pages/TasksPage'
import UserManagementPage from '@/pages/UserManagementPage'
import AnalysisPage from '@/pages/AnalysisPage'
import WarehousePage from '@/pages/WarehousePage'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ToastProvider } from '@/components/ui/Toast'
import { LoadingProvider, PageLoading } from '@/components/ui/LoadingStates'

function AppContent() {
  const { isAuthenticated, isLoading } = useAuthStore()

  useEffect(() => {
    // Initialize WebSocket connection when user is authenticated
    if (isAuthenticated) {
      websocketService.connect()
      
      return () => {
        websocketService.disconnect()
      }
    }
  }, [isAuthenticated])

  if (isLoading) {
    return <PageLoading message="Uygulama yükleniyor..." />
  }

  return (
    <ErrorBoundary>
      <Routes>
      {/* Public routes */}
      <Route 
        path="/login" 
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
        } 
      />
      
      {/* Protected routes */}
      <Route 
        path="/*" 
        element={
          isAuthenticated ? (
            <DashboardLayout>
              <Routes>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/shifts" element={<ShiftsPage />} />
                <Route path="/vehicles" element={<VehiclesPage />} />
                <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/warehouse" element={<WarehousePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/users" element={<UserManagementPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </DashboardLayout>
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      </Routes>
    </ErrorBoundary>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <LoadingProvider>
          <AppContent />
        </LoadingProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App