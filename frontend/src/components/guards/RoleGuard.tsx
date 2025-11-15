import React from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Shield, AlertTriangle, Lock, User } from 'lucide-react';

// User roles enum matching backend
export enum UserRole {
  PRESIDENT = 'PRESIDENT',
  ADMIN = 'ADMIN',
  SUPERVISOR = 'SUPERVISOR',
  OPERATOR = 'OPERATOR',
  MESSENGER = 'MESSENGER',
  DEPO_KULLANICISI = 'DEPO_KULLANICISI'
}

// Role hierarchy for permission checking
const roleHierarchy: Record<UserRole, number> = {
  [UserRole.PRESIDENT]: 5,
  [UserRole.ADMIN]: 4,
  [UserRole.SUPERVISOR]: 3,
  [UserRole.OPERATOR]: 2,
  [UserRole.MESSENGER]: 1,
  [UserRole.DEPO_KULLANICISI]: 2.5, // Between OPERATOR and SUPERVISOR for warehouse access
};

// Role display names in Turkish
const roleDisplayNames: Record<UserRole, string> = {
  [UserRole.PRESIDENT]: 'Başkan',
  [UserRole.ADMIN]: 'Yönetici',
  [UserRole.SUPERVISOR]: 'Supervisor',
  [UserRole.OPERATOR]: 'Operatör',
  [UserRole.MESSENGER]: 'Mesajcı',
  [UserRole.DEPO_KULLANICISI]: 'Depo Kullanıcısı',
};

interface RoleGuardProps {
  children: React.ReactNode;
  requiredRole: UserRole | UserRole[];
  fallback?: React.ReactNode;
  showFallback?: boolean;
  redirectTo?: string;
  strict?: boolean; // If true, requires exact role match
}

interface PermissionDeniedProps {
  requiredRole: UserRole | UserRole[];
  currentRole: UserRole;
  reason?: string;
  redirectTo?: string;
}

// Permission denied component
const PermissionDenied: React.FC<PermissionDeniedProps> = ({
  requiredRole,
  currentRole,
  reason,
  redirectTo
}) => {
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const requiredRoleNames = requiredRoles.map(role => roleDisplayNames[role]).join(', ');

  const handleRedirect = () => {
    if (redirectTo) {
      window.location.href = redirectTo;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Erişim Reddedildi
          </h1>
          
          <p className="text-gray-600 mb-4">
            {reason || 'Bu sayfayı görüntülemek için yetkiniz bulunmuyor.'}
          </p>
          
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-gray-500">Mevcut Rol:</span>
                <div className="font-medium text-gray-900">
                  {roleDisplayNames[currentRole]}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Gerekli Rol:</span>
                <div className="font-medium text-gray-900">
                  {requiredRoleNames}
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            {redirectTo && (
              <button
                onClick={handleRedirect}
                className="btn btn-primary w-full"
              >
                <User className="w-4 h-4 mr-2" />
                Ana Sayfaya Dön
              </button>
            )}
            
            <button
              onClick={() => window.history.back()}
              className="btn btn-secondary w-full"
            >
              Geri Dön
            </button>
          </div>
          
          <div className="mt-6 text-xs text-gray-500">
            Yetki problemi yaşıyorsanız lütfen yöneticinizle iletişime geçin.
          </div>
        </div>
      </div>
    </div>
  );
};

// Role guard component
export const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  requiredRole,
  fallback,
  showFallback = true,
  redirectTo = '/dashboard',
  strict = false
}) => {
  const { user, isAuthenticated } = useAuthStore();

  // Check if user is authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Oturum Açmanız Gerekiyor
            </h1>
            <p className="text-gray-600 mb-6">
              Bu sayfayı görüntülemek için önce oturum açmalısınız.
            </p>
            <button
              onClick={() => window.location.href = '/login'}
              className="btn btn-primary w-full"
            >
              Oturum Aç
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentRole = user.role as UserRole;
  const hasPermission = checkRolePermission(currentRole, requiredRole, strict);

  if (!hasPermission) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showFallback) {
      return (
        <PermissionDenied
          requiredRole={requiredRole}
          currentRole={currentRole}
          redirectTo={redirectTo}
        />
      );
    }

    return null;
  }

  return <>{children}</>;
};

// Hook for checking permissions
export const usePermission = () => {
  const { user } = useAuthStore();

  const hasRole = (requiredRole: UserRole | UserRole[], strict = false): boolean => {
    if (!user) return false;
    return checkRolePermission(user.role as UserRole, requiredRole, strict);
  };

  const hasAnyRole = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.some(role => checkRolePermission(user.role as UserRole, role, true));
  };

  const hasAllRoles = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.every(role => checkRolePermission(user.role as UserRole, role, true));
  };

  const canAccessResource = (resourcePermissions: {
    read?: UserRole[];
    write?: UserRole[];
    delete?: UserRole[];
  }, action: 'read' | 'write' | 'delete'): boolean => {
    if (!user) return false;
    const requiredRoles = resourcePermissions[action];
    if (!requiredRoles || requiredRoles.length === 0) return true;
    return hasAnyRole(requiredRoles);
  };

  const getRoleLevel = (): number => {
    if (!user) return 0;
    return roleHierarchy[user.role as UserRole] || 0;
  };

  const isAtLeastRole = (minRole: UserRole): boolean => {
    if (!user) return false;
    const currentLevel = roleHierarchy[user.role as UserRole] || 0;
    const requiredLevel = roleHierarchy[minRole];
    return currentLevel >= requiredLevel;
  };

  return {
    hasRole,
    hasAnyRole,
    hasAllRoles,
    canAccessResource,
    getRoleLevel,
    isAtLeastRole,
    currentRole: user?.role as UserRole,
    currentRoleDisplayName: user ? roleDisplayNames[user.role as UserRole] : null,
  };
};

// Helper function to check role permissions
export const checkRolePermission = (
  currentRole: UserRole,
  requiredRole: UserRole | UserRole[],
  strict = false
): boolean => {
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const currentLevel = roleHierarchy[currentRole] || 0;

  if (strict) {
    // Strict mode: user must have exact role match
    return requiredRoles.includes(currentRole);
  } else {
    // Hierarchy mode: user must have required level or higher
    return requiredRoles.some(role => {
      const requiredLevel = roleHierarchy[role] || 0;
      return currentLevel >= requiredLevel;
    });
  }
};

// Higher-order component for role-based protection
export const withRoleGuard = <P extends object>(
  Component: React.ComponentType<P>,
  requiredRole: UserRole | UserRole[],
  options?: Omit<RoleGuardProps, 'children' | 'requiredRole'>
) => {
  const WrappedComponent = (props: P) => (
    <RoleGuard requiredRole={requiredRole} {...options}>
      <Component {...props} />
    </RoleGuard>
  );

  WrappedComponent.displayName = `withRoleGuard(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Component for showing different content based on roles
interface RoleBasedContentProps {
  roles: Partial<Record<UserRole, React.ReactNode>>;
  fallback?: React.ReactNode;
}

export const RoleBasedContent: React.FC<RoleBasedContentProps> = ({
  roles,
  fallback
}) => {
  const { user } = useAuthStore();

  if (!user) {
    return <>{fallback}</>;
  }

  const currentRole = user.role as UserRole;
  const content = roles[currentRole];

  if (content) {
    return <>{content}</>;
  }

  return <>{fallback}</>;
};

// Component for conditional rendering based on permissions
interface ConditionalRenderProps {
  condition: () => boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const ConditionalRender: React.FC<ConditionalRenderProps> = ({
  condition,
  children,
  fallback
}) => {
  const shouldRender = condition();
  return <>{shouldRender ? children : fallback}</>;
};

// Role-based navigation filter
export const filterNavigationByRole = (
  navigation: Array<{ requiredRole?: UserRole | UserRole[]; [key: string]: any }>,
  currentRole: UserRole
) => {
  return navigation.filter(item => {
    if (!item.requiredRole) return true;
    return checkRolePermission(currentRole, item.requiredRole);
  });
};