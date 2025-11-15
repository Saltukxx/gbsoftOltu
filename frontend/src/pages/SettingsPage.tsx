import React, { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/authService'
import { User, Bell, Shield, Globe, Database, Lock, Eye, EyeOff } from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole } from '@/components/guards/RoleGuard'

function SettingsPageContent() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  
  // Password change form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>
        <p className="mt-1 text-sm text-gray-500">
          Hesap ve uygulama ayarlarınızı yönetin
        </p>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2" />
            Hesap Bilgileri
          </h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Ad Soyad</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {user?.firstName} {user?.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">E-posta</dt>
              <dd className="mt-1 text-sm text-gray-900">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Rol</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {user?.role === 'ADMIN' && 'Yönetici'}
                {user?.role === 'SUPERVISOR' && 'Supervisor'}
                {user?.role === 'OPERATOR' && 'Operatör'}
                {user?.role === 'MESSENGER' && 'Mesajcı'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Kullanıcı ID</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{user?.id}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Bell className="w-5 h-5 mr-2" />
            Bildirim Ayarları
          </h2>
          <p className="text-sm text-gray-500">
            Bildirim ayarları yakında eklenecek.
          </p>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            Güvenlik
          </h2>
          
          {passwordChangeSuccess ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-800">
                Şifreniz başarıyla güncellendi. Lütfen tekrar giriş yapın.
              </p>
            </div>
          ) : (
            <form
              onSubmit={useCallback(async (e) => {
                e.preventDefault()
                setPasswordErrors({})
                setIsChangingPassword(true)

                // Client-side validation
                const errors: Record<string, string> = {}
                if (!passwordForm.currentPassword) {
                  errors.currentPassword = 'Mevcut şifre gereklidir'
                }
                if (!passwordForm.newPassword) {
                  errors.newPassword = 'Yeni şifre gereklidir'
                } else if (passwordForm.newPassword.length < 8) {
                  errors.newPassword = 'Yeni şifre en az 8 karakter olmalıdır'
                } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordForm.newPassword)) {
                  errors.newPassword = 'Yeni şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir'
                }
                if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                  errors.confirmPassword = 'Şifre onayı eşleşmiyor'
                }

                if (Object.keys(errors).length > 0) {
                  setPasswordErrors(errors)
                  setIsChangingPassword(false)
                  return
                }

                try {
                  await authService.changePassword({
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword,
                    confirmPassword: passwordForm.confirmPassword,
                  })
                  
                  setPasswordChangeSuccess(true)
                  
                  // Logout user and redirect to login after a short delay
                  setTimeout(() => {
                    logout()
                    navigate('/login', { 
                      state: { message: 'Şifreniz güncellendi, lütfen tekrar giriş yapın' } 
                    })
                  }, 2000)
                } catch (error: any) {
                  const errorMessage = error.response?.data?.error || 'Şifre değiştirme başarısız oldu'
                  const errorDetails = error.response?.data?.errors
                  
                  if (errorDetails && Array.isArray(errorDetails)) {
                    const fieldErrors: Record<string, string> = {}
                    errorDetails.forEach((err: any) => {
                      if (err.param) {
                        fieldErrors[err.param] = err.msg || errorMessage
                      }
                    })
                    setPasswordErrors(fieldErrors)
                  } else {
                    setPasswordErrors({ submit: errorMessage })
                  }
                } finally {
                  setIsChangingPassword(false)
                }
              }, [passwordForm, logout, navigate])}
              className="space-y-4"
            >
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Mevcut Şifre
                </label>
                <div className="relative">
                  <input
                    id="currentPassword"
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => {
                      setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                      setPasswordErrors({ ...passwordErrors, currentPassword: '' })
                    }}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      passwordErrors.currentPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isChangingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                    className="absolute right-2 top-2.5 text-gray-500 hover:text-gray-700"
                    disabled={isChangingPassword}
                  >
                    {showPasswords.current ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {passwordErrors.currentPassword && (
                  <p className="mt-1 text-sm text-red-600">{passwordErrors.currentPassword}</p>
                )}
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Yeni Şifre
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => {
                      setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      setPasswordErrors({ ...passwordErrors, newPassword: '' })
                    }}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      passwordErrors.newPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isChangingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                    className="absolute right-2 top-2.5 text-gray-500 hover:text-gray-700"
                    disabled={isChangingPassword}
                  >
                    {showPasswords.new ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {passwordErrors.newPassword && (
                  <p className="mt-1 text-sm text-red-600">{passwordErrors.newPassword}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  En az 8 karakter, bir büyük harf, bir küçük harf ve bir rakam içermelidir
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Yeni Şifre (Tekrar)
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => {
                      setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      setPasswordErrors({ ...passwordErrors, confirmPassword: '' })
                    }}
                    onPaste={(e) => {
                      e.preventDefault()
                      setPasswordErrors({ ...passwordErrors, confirmPassword: 'Lütfen şifreyi yapıştırmayın, manuel olarak girin' })
                    }}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      passwordErrors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isChangingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                    className="absolute right-2 top-2.5 text-gray-500 hover:text-gray-700"
                    disabled={isChangingPassword}
                  >
                    {showPasswords.confirm ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {passwordErrors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{passwordErrors.confirmPassword}</p>
                )}
              </div>

              {passwordErrors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{passwordErrors.submit}</p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="btn btn-primary flex items-center"
                >
                  {isChangingPassword ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Güncelleniyor...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Şifreyi Değiştir
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Globe className="w-5 h-5 mr-2" />
            Dil ve Bölge
          </h2>
          <p className="text-sm text-gray-500">
            Dil ve bölge ayarları yakında eklenecek.
          </p>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Database className="w-5 h-5 mr-2" />
            Sistem Bilgileri
          </h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Ortam</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {import.meta.env.MODE === 'development' ? 'Geliştirme' : 'Üretim'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">API URL</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono break-all">
                {import.meta.env.VITE_API_URL || 'http://localhost:3001'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={UserRole.MESSENGER}>
        <SettingsPageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}

