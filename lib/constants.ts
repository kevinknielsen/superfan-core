/**
 * Shared application constants
 */

/**
 * Treasury user ID - used to exclude internal purchases from campaign progress
 * This user represents Stripe purchases being recycled through crypto,
 * so counting them would be double-counting.
 */
export const TREASURY_USER_ID = '7c4c839b-53e3-4b9e-9129-be99d4814012';

