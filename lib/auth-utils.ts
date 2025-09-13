import { useMemo } from 'react';
import { NextRequest } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';

// Re-export client-safe security functions for convenience
export { truncateText, validateEmail, debugLog, productionLog, errorLog } from './security';

// Server-side admin check - only works in server context
export async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  
  // This will only work in server context where process.env is available
  if (typeof window !== 'undefined') {
    console.warn('isAdmin called in client context - returning false');
    return false;
  }
  
  const adminIds = process.env.ADMIN_USER_IDS?.split(',')
    .map(id => id.trim())
    .filter(Boolean) || [];
  return adminIds.includes(userId);
}

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

// Project role checking hook - client-side version without admin check
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
    // Note: isAdmin check removed for client-side hook - use server-side admin checking where needed
    const userWalletAddress = getUserWalletAddress(user);
    
    const isTeamMember = teamMembers?.some(
      (member: any) => member.wallet_address === userWalletAddress
    ) || false;

    const canEdit = isCreator; // Admin check would need to be done server-side
    const canView = isCreator || isTeamMember;

    return {
      isCreator,
      isAdmin: false, // Client-side hook can't determine admin status
      isTeamMember,
      canEdit,
      canView,
    };
  }, [project, user, teamMembers]);
} 