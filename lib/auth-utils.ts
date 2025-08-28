import { useMemo } from 'react';
import { NextRequest } from 'next/server';
import { isAdmin } from './security';
import { verifyUnifiedAuth } from '@/app/api/auth';

// Re-export security functions for convenience
export { isAdmin, truncateText, validateEmail, debugLog, productionLog, errorLog } from './security';

// Server-side user authentication
export async function getServerUser(request?: NextRequest) {
  if (!request) {
    // If no request provided, this is likely from a server component
    // where we don't have access to the request object
    return null;
  }
  
  return await verifyUnifiedAuth(request);
}

// User wallet utilities
export function getUserWalletAddress(user: any): string | null {
  if (!user?.wallet) return null;
  
  // Handle both string and object wallet formats
  if (typeof user.wallet === 'string') {
    return user.wallet;
  }
  
  if (typeof user.wallet === 'object' && user.wallet.address) {
    return user.wallet.address;
  }
  
  return null;
}

// Project role checking hook
export function useProjectRoles(project: any, user: any, teamMembers?: any[]) {
  return useMemo(() => {
    if (!user || !project) {
      return {
        isCreator: false,
        isAdmin: false,
        isTeamMember: false,
        canEdit: false,
        canView: false,
      };
    }

    const isCreator = user.id === project.creator_id;
    const isUserAdmin = isAdmin(user.id);
    const userWalletAddress = getUserWalletAddress(user);
    
    const isTeamMember = teamMembers?.some(
      (member: any) => member.wallet_address === userWalletAddress
    ) || false;

    const canEdit = isCreator || isUserAdmin;
    const canView = isCreator || isUserAdmin || isTeamMember;

    return {
      isCreator,
      isAdmin: isUserAdmin,
      isTeamMember,
      canEdit,
      canView,
    };
  }, [project, user, teamMembers]);
} 