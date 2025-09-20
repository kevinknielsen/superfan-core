import { supabase } from './supabase';
import type { User } from '@/types/membership.types';

export interface CreateUserParams {
  privyId: string;
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
}

export interface UpdateUserParams {
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
  metalHolderId?: string | null;
}

/**
 * Get or create a user based on their Privy ID
 * This is called when a user first authenticates via Privy
 */
export async function getOrCreateUser(params: CreateUserParams): Promise<User> {
  const { privyId, email, name, walletAddress } = params;

  // First try to find existing user
  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('privy_id', privyId)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    throw new Error(`Failed to check for existing user: ${findError.message}`);
  }

  if (existingUser) {
    // Update user info if needed (email, name might have changed)
    const updates: any = {};
    if (email && email !== existingUser.email) updates.email = email;
    if (name && name !== existingUser.name) updates.name = name;
    if (walletAddress && walletAddress !== (existingUser as any).wallet_address) updates.wallet_address = walletAddress;

    if (Object.keys(updates).length > 0) {
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('privy_id', privyId)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update user:', updateError);
        return existingUser; // Return existing user if update fails
      }
      return updatedUser;
    }

    return existingUser;
  }

  // Create new user
  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({
      privy_id: privyId,
      email,
      name,
      wallet_address: walletAddress,
    })
    .select()
    .single();

  if (createError) {
    // If it's a duplicate key error, try to fetch the existing user
    if (createError.code === '23505' || createError.message.includes('duplicate key')) {
      console.log(`[User Management] User already exists, fetching existing user for privy_id: ${privyId}`);
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('privy_id', privyId)
        .single();
        
      if (fetchError) {
        throw new Error(`Failed to fetch existing user: ${fetchError.message}`);
      }
      
      return existingUser;
    }
    
    throw new Error(`Failed to create user: ${createError.message}`);
  }

  return newUser;
}

/**
 * Get user by Privy ID
 */
export async function getUserByPrivyId(privyId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('privy_id', privyId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // User not found
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return data;
}

/**
 * Update user's Metal holder ID when they first create a Metal wallet
 */
export async function updateUserMetalHolderId(privyId: string, metalHolderId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ metal_holder_id: metalHolderId })
    .eq('privy_id', privyId);

  if (error) {
    throw new Error(`Failed to update Metal holder ID: ${error.message}`);
  }
}

/**
 * Get user by UUID (for membership queries)
 */
export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // User not found
    throw new Error(`Failed to get user by ID: ${error.message}`);
  }

  return data;
}
