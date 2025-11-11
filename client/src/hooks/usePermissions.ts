import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getPermissions, type Permissions } from '@/lib/permissions';

export interface PermissionsWithContext extends Permissions {
  role?: string;
  isImpersonating: boolean;
}

export function usePermissions(): PermissionsWithContext {
  const { user } = useAuth();
  
  // Check for customer impersonation from customer auth endpoint
  // This query will fail silently on staff pages (no customer session) but succeed on customer pages
  const { data: customerUser } = useQuery<{ isImpersonating?: boolean }>({
    queryKey: ["/api/customer-auth/user"],
    retry: false,
    staleTime: 0, // Always refetch to get latest impersonation state
  });
  
  const permissions = useMemo(() => {
    return getPermissions(user?.role);
  }, [user?.role]);

  // Get impersonation status from customer user if available
  const isImpersonating = customerUser?.isImpersonating || false;
  
  return {
    ...permissions,
    role: user?.role,
    isImpersonating,
  };
}
