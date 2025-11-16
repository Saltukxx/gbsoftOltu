import { ReactNode, useState, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore, useHasRole } from '@/stores/authStore'
import {
  Building,
  LayoutDashboard,
  Calendar,
  Truck,
  MessageCircle,
  CheckSquare,
  LogOut,
  Menu,
  X,
  Bell,
  Settings,
  User,
  Users,
  BarChart3,
  Package,
  Route
} from 'lucide-react'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const allNavigationItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      requiredRole: 'MESSENGER',
    },
    {
      name: 'Vardiyalar',
      href: '/shifts',
      icon: Calendar,
      requiredRole: 'OPERATOR',
    },
    {
      name: 'Araçlar',
      href: '/vehicles',
      icon: Truck,
      requiredRole: 'OPERATOR',
    },
    {
      name: 'Mesajlar',
      href: '/messages',
      icon: MessageCircle,
      requiredRole: 'MESSENGER',
    },
    {
      name: 'Görevler',
      href: '/tasks',
      icon: CheckSquare,
      requiredRole: 'MESSENGER',
    },
    {
      name: 'Analiz',
      href: '/analysis',
      icon: BarChart3,
      requiredRole: 'SUPERVISOR',
    },
    {
      name: 'Rota Optimizasyonu',
      href: '/route-optimization',
      icon: Route,
      requiredRole: 'SUPERVISOR',
    },
    {
      name: 'Depo Yönetimi',
      href: '/warehouse',
      icon: Package,
      requiredRole: 'DEPO_KULLANICISI',
    },
    {
      name: 'Kullanıcı Yönetimi',
      href: '/users',
      icon: Users,
      requiredRole: 'PRESIDENT',
    },
  ]

  // Filter navigation items based on user role (using useMemo to avoid recalculation)
  const navigation = useMemo(() => {
    const roleHierarchy = {
      MESSENGER: 1,
      OPERATOR: 2,
      DEPO_KULLANICISI: 2.5,
      SUPERVISOR: 3,
      ADMIN: 4,
      PRESIDENT: 5,
    }
    
    const userLevel = user?.role ? (roleHierarchy[user.role as keyof typeof roleHierarchy] || 0) : 0
    
    return allNavigationItems.filter(item => {
      const requiredLevel = roleHierarchy[item.requiredRole as keyof typeof roleHierarchy] || 0
      return userLevel >= requiredLevel
    })
  }, [user?.role])

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Building className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-gray-900">Oltu Belediyesi</h1>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-500"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation - Scrollable */}
        <nav className="flex-1 overflow-y-auto mt-8 px-4">
          <div className="space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                  }`
                }
              >
                <item.icon
                  className="mr-3 h-5 w-5 flex-shrink-0"
                  aria-hidden="true"
                />
                {item.name}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User info - Fixed at bottom */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.role === 'PRESIDENT' && 'Başkan'}
                {user?.role === 'ADMIN' && 'Yönetici'}
                {user?.role === 'SUPERVISOR' && 'Supervisor'}
                {user?.role === 'OPERATOR' && 'Operatör'}
                {user?.role === 'MESSENGER' && 'Mesajcı'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 text-sm text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Çıkış Yap
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:pl-0">
        {/* Top navigation */}
        <header className="bg-white shadow-sm border-b border-gray-200 lg:static lg:overflow-y-visible">
          <div className="mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative flex justify-between h-16">
              <div className="flex items-center">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <h1 className="ml-4 lg:ml-0 text-lg font-medium text-gray-900">
                  Oltu Belediyesi Yönetim Paneli
                </h1>
              </div>

              <div className="flex items-center space-x-4">
                <button 
                  className="p-2 text-gray-400 hover:text-gray-500"
                  title="Bildirimler"
                >
                  <Bell className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => navigate('/settings')}
                  className="p-2 text-gray-400 hover:text-gray-500"
                  title="Ayarlar"
                >
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}