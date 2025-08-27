import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  billing_period: 'monthly' | 'yearly';
  features: string[];
  max_house_account_balance_cents: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'paused';
  current_period_start: string;
  current_period_end: string;
  auto_renew: boolean;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
  plan?: MembershipPlan;
}

// Get all membership plans
export function useMembershipPlans() {
  return useQuery({
    queryKey: ['membership-plans'],
    queryFn: async (): Promise<MembershipPlan[]> => {
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      return data || [];
    },
  });
}

// Get user's current membership by Privy ID
export function useUserMembership(privyUserId: string | null) {
  return useQuery({
    queryKey: ['user-membership', privyUserId],
    queryFn: async (): Promise<Membership | null> => {
      if (!privyUserId) return null;

      // First get our internal user by Privy ID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyUserId)
        .single();

      if (userError) {
        if (userError.code === 'PGRST116') return null; // User not found
        throw userError;
      }

      // Then get their membership
      const { data, error } = await supabase
        .from('memberships')
        .select(`
          *,
          plan:membership_plans(*)
        `)
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No membership found
        throw error;
      }
      return data;
    },
    enabled: !!privyUserId,
  });
}

// Check if user has specific feature access
export function useFeatureAccess(privyUserId: string | null, feature: string) {
  const { data: membership } = useUserMembership(privyUserId);
  
  return {
    hasAccess: membership?.status === 'active' && 
              membership?.plan?.features?.includes(feature),
    membership,
  };
}

// Create membership subscription
export function useCreateMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      userId, 
      planId, 
      stripeSubscriptionId 
    }: { 
      userId: string; 
      planId: string; 
      stripeSubscriptionId: string;
    }) => {
      const now = new Date().toISOString();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const { data, error } = await supabase
        .from('memberships')
        .insert({
          user_id: userId,
          plan_id: planId,
          status: 'active',
          current_period_start: now,
          current_period_end: nextMonth.toISOString(),
          auto_renew: true,
          stripe_subscription_id: stripeSubscriptionId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-membership', data.user_id] });
    },
  });
}

// Update membership status
export function useUpdateMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      membershipId, 
      updates 
    }: { 
      membershipId: string; 
      updates: Partial<Membership>;
    }) => {
      const { data, error } = await supabase
        .from('memberships')
        .update(updates)
        .eq('id', membershipId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-membership', data.user_id] });
    },
  });
}

// Cancel membership
export function useCancelMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (membershipId: string) => {
      const { data, error } = await supabase
        .from('memberships')
        .update({ status: 'canceled', auto_renew: false })
        .eq('id', membershipId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-membership', data.user_id] });
    },
  });
}
