export interface Permissions {
  canImpersonateCustomers: boolean;
  canViewPrices: boolean;
  canManageUsers: boolean;
  canManageCustomers: boolean;
  canManageJobs: boolean;
  canViewReports: boolean;
}

export function getPermissions(role?: string): Permissions {
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isManager = role === 'manager' || isAdmin;
  const isStaff = role === 'staff' || isManager;

  return {
    canImpersonateCustomers: isSuperAdmin,
    canViewPrices: isSuperAdmin || isAdmin || isManager,
    canManageUsers: isSuperAdmin,
    canManageCustomers: isSuperAdmin || isAdmin || isManager,
    canManageJobs: isStaff,
    canViewReports: isSuperAdmin || isAdmin || isManager,
  };
}
