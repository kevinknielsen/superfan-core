import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface HouseAccount {
  id: string;
  user_id: string;
  balance_cents: number;
  lifetime_topup_cents: number;
  lifetime_spend_cents: number;
  created_at: string;
  updated_at: string;
}

export interface HouseTransaction {
  id: string;
  house_account_id: string;
  type: 'topup' | 'spend' | 'refund' | 'adjustment';
  amount_cents: number;
  description: string;
  reference_id: string | null;
  stripe_payment_intent_id: string | null;
  admin_user_id: string | null;
  created_at: string;
}

export interface RedemptionCode {
  id: string;
  code: string;
  value_cents: number;
  uses_remaining: number;
  max_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_by_user_id: string | null;
  created_at: string;
}

// Get user's house account by Privy ID
export function useHouseAccount(privyUserId: string | null) {
  return useQuery({
    queryKey: ['house-account', privyUserId],
    queryFn: async (): Promise<HouseAccount | null> => {
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

      const { data, error } = await supabase
        .from('house_accounts')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No house account found, create one
          const { data: newAccount, error: createError } = await supabase
            .from('house_accounts')
            .insert({
              user_id: user.id,
              balance_cents: 0,
              lifetime_topup_cents: 0,
              lifetime_spend_cents: 0,
            })
            .select()
            .single();

          if (createError) throw createError;
          return newAccount;
        }
        throw error;
      }
      return data;
    },
    enabled: !!privyUserId,
  });
}

// Get house account transaction history
export function useHouseTransactions(privyUserId: string | null, limit = 50) {
  const { data: houseAccount } = useHouseAccount(privyUserId);

  return useQuery({
    queryKey: ['house-transactions', houseAccount?.id, limit],
    queryFn: async (): Promise<HouseTransaction[]> => {
      if (!houseAccount?.id) return [];

      const { data, error } = await supabase
        .from('house_transactions')
        .select('*')
        .eq('house_account_id', houseAccount.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
    enabled: !!houseAccount?.id,
  });
}

// Add house account credit
export function useAddHouseCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      userId, 
      amountCents, 
      description, 
      referenceId,
      stripePaymentIntentId 
    }: { 
      userId: string;
      amountCents: number;
      description: string;
      referenceId?: string;
      stripePaymentIntentId?: string;
    }) => {
      // This would normally be called from a server-side API route
      // that handles the Stripe payment confirmation
      const { data: account } = await supabase
        .from('house_accounts')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!account) throw new Error('House account not found');

      // Update balance and lifetime totals
      const { error: updateError } = await supabase
        .from('house_accounts')
        .update({
          balance_cents: account.balance_cents + amountCents,
          lifetime_topup_cents: account.lifetime_topup_cents + amountCents,
        })
        .eq('id', account.id);

      if (updateError) throw updateError;

      // Create transaction record
      const { data: transaction, error: transactionError } = await supabase
        .from('house_transactions')
        .insert({
          house_account_id: account.id,
          type: 'topup',
          amount_cents: amountCents,
          description,
          reference_id: referenceId,
          stripe_payment_intent_id: stripePaymentIntentId,
        })
        .select()
        .single();

      if (transactionError) throw transactionError;
      return transaction;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['house-account', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['house-transactions'] });
    },
  });
}

// Spend house account credit
export function useSpendHouseCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      userId, 
      amountCents, 
      description, 
      referenceId 
    }: { 
      userId: string;
      amountCents: number;
      description: string;
      referenceId?: string;
    }) => {
      const { data: account } = await supabase
        .from('house_accounts')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!account) throw new Error('House account not found');
      if (account.balance_cents < amountCents) {
        throw new Error('Insufficient balance');
      }

      // Update balance and lifetime totals
      const { error: updateError } = await supabase
        .from('house_accounts')
        .update({
          balance_cents: account.balance_cents - amountCents,
          lifetime_spend_cents: account.lifetime_spend_cents + amountCents,
        })
        .eq('id', account.id);

      if (updateError) throw updateError;

      // Create transaction record
      const { data: transaction, error: transactionError } = await supabase
        .from('house_transactions')
        .insert({
          house_account_id: account.id,
          type: 'spend',
          amount_cents: -amountCents, // Negative for spending
          description,
          reference_id: referenceId,
        })
        .select()
        .single();

      if (transactionError) throw transactionError;
      return transaction;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['house-account', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['house-transactions'] });
    },
  });
}

// Validate redemption code
export function useValidateRedemptionCode() {
  return useMutation({
    mutationFn: async (code: string): Promise<RedemptionCode> => {
      const { data, error } = await supabase
        .from('redemption_codes')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .gt('uses_remaining', 0)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Invalid or expired redemption code');
        }
        throw error;
      }

      // Check expiration
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        throw new Error('Redemption code has expired');
      }

      return data;
    },
  });
}

// Redeem code for house account credit
export function useRedeemCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      userId, 
      code 
    }: { 
      userId: string;
      code: string;
    }) => {
      // First validate the code
      const { data: redemptionCode, error: codeError } = await supabase
        .from('redemption_codes')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .gt('uses_remaining', 0)
        .single();

      if (codeError || !redemptionCode) {
        throw new Error('Invalid or expired redemption code');
      }

      // Check if user already redeemed this code
      const { data: existingRedemption } = await supabase
        .from('code_redemptions')
        .select('*')
        .eq('redemption_code_id', redemptionCode.id)
        .eq('user_id', userId)
        .single();

      if (existingRedemption) {
        throw new Error('You have already redeemed this code');
      }

      // Get house account
      const { data: account } = await supabase
        .from('house_accounts')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!account) throw new Error('House account not found');

      // Create transaction
      const { data: transaction, error: transactionError } = await supabase
        .from('house_transactions')
        .insert({
          house_account_id: account.id,
          type: 'topup',
          amount_cents: redemptionCode.value_cents,
          description: `Redeemed code: ${code}`,
          reference_id: redemptionCode.id,
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Update house account balance
      const { error: updateError } = await supabase
        .from('house_accounts')
        .update({
          balance_cents: account.balance_cents + redemptionCode.value_cents,
          lifetime_topup_cents: account.lifetime_topup_cents + redemptionCode.value_cents,
        })
        .eq('id', account.id);

      if (updateError) throw updateError;

      // Record redemption
      const { error: redemptionError } = await supabase
        .from('code_redemptions')
        .insert({
          redemption_code_id: redemptionCode.id,
          user_id: userId,
          house_transaction_id: transaction.id,
        });

      if (redemptionError) throw redemptionError;

      // Decrement code uses
      const { error: decrementError } = await supabase
        .from('redemption_codes')
        .update({
          uses_remaining: redemptionCode.uses_remaining - 1,
        })
        .eq('id', redemptionCode.id);

      if (decrementError) throw decrementError;

      return {
        transaction,
        amountCents: redemptionCode.value_cents,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['house-account', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['house-transactions'] });
    },
  });
}

// Helper function to format currency
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
