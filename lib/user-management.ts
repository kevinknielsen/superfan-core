import { supabase } from './supabase';
import type { User } from '@/types/membership.types';

export interface CreateUserParams {
  privyId: string;
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
}

export interface CreateFarcasterUserParams {
  farcasterFid: string;
  username?: string | null;
  displayName?: string | null;
  pfpUrl?: string | null;
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
 * Get or create a user based on their Farcaster FID
 * This is called when a user first authenticates via Farcaster wallet apps
 */
export async function getOrCreateFarcasterUser(params: CreateFarcasterUserParams): Promise<User> {
  const { farcasterFid, username, displayName, pfpUrl } = params;

  // Normalize farcasterFid to ensure it has the "farcaster:" prefix
  const normalizedFid = farcasterFid.startsWith('farcaster:') 
    ? farcasterFid 
    : `farcaster:${farcasterFid}`;

  console.log('[User Management] Syncing Farcaster user:', { farcasterFid: normalizedFid, username, displayName });

  // First try to find existing user by farcaster_id
  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('farcaster_id', normalizedFid)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    throw new Error(`Failed to check for existing Farcaster user: ${findError.message}`);
  }

  if (existingUser) {
    // Update user info if profile data has changed
    const updates: any = {};
    const newName = displayName || username;
    if (newName && newName !== existingUser.name) updates.name = newName;
    // Note: we don't store pfpUrl in users table currently, but we could add it later

    if (Object.keys(updates).length > 0) {
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('farcaster_id', normalizedFid)
        .select()
        .single();

      if (updateError) {
        console.error('[User Management] Failed to update Farcaster user:', updateError);
        return existingUser; // Return existing user if update fails
      }
      console.log('[User Management] Farcaster user updated:', updatedUser.id);
      return updatedUser;
    }

    console.log('[User Management] Farcaster user found:', existingUser.id);
    return existingUser;
  }

  // Create new Farcaster user
  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({
      farcaster_id: normalizedFid,
      name: displayName || username || `Farcaster User`,
      // email and wallet_address left null for now
    })
    .select()
    .single();

  if (createError) {
    // If it's a duplicate key error, try to fetch the existing user
    if (createError.code === '23505' || createError.message.includes('duplicate key')) {
      console.log(`[User Management] Farcaster user already exists, fetching: ${normalizedFid}`);
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('farcaster_id', normalizedFid)
        .single();
        
      if (fetchError) {
        throw new Error(`Failed to fetch existing Farcaster user: ${fetchError.message}`);
      }
      
      return existingUser;
    }
    
    throw new Error(`Failed to create Farcaster user: ${createError.message}`);
  }

  console.log('[User Management] New Farcaster user created:', newUser.id);
  return newUser;
}

/**
 * Get or create user based on unified auth result
 * Automatically calls the correct function based on auth type
 */
export async function getOrCreateUserFromAuth(auth: { userId: string; type: 'privy' | 'farcaster' }): Promise<User> {
  if (auth.type === 'farcaster') {
    return getOrCreateFarcasterUser({
      farcasterFid: auth.userId,
      username: null,
      displayName: null,
      pfpUrl: null,
    });
  } else {
    return getOrCreateUser({
      privyId: auth.userId,
    });
  }
}

/**
 * Convert camelCase keys to snake_case for Supabase
 */
function toSnakeCase(updates: Record<string, any>): Record<string, any> {
  // Known field mappings
  const fieldMap: Record<string, string> = {
    walletAddress: 'wallet_address',
    metalHolderId: 'metal_holder_id',
  };

  const snakeCaseUpdates: Record<string, any> = {};

  for (const [key, value] of Object.entries(updates)) {
    // Use known mapping if available
    if (fieldMap[key]) {
      snakeCaseUpdates[fieldMap[key]] = value;
    } 
    // If already snake_case (contains underscore), leave as-is
    else if (key.includes('_')) {
      snakeCaseUpdates[key] = value;
    } 
    // Convert camelCase to snake_case
    else {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      snakeCaseUpdates[snakeKey] = value;
    }
  }

  return snakeCaseUpdates;
}

/**
 * Update user data (supports both Privy and Farcaster users)
 * Accepts both camelCase and snake_case field names
 */
export async function updateUser(userId: string, updates: UpdateUserParams): Promise<User> {
  // Normalize to snake_case for Supabase
  const snakeCaseUpdates = toSnakeCase(updates as Record<string, any>);
  
  const { data: updatedUser, error } = await supabase
    .from('users')
    .update(snakeCaseUpdates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update user: ${error.message}`);
  }

  return updatedUser;
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
