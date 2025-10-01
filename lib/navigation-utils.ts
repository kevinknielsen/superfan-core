/**
 * Navigation utilities for wallet app and web contexts
 * Handles Stripe checkout redirects that need to open in external browsers for wallet apps
 */

/**
 * Navigate to Stripe checkout URL
 * - Wallet apps: Opens in external browser (Stripe doesn't work in iframes)
 * - Web: Uses normal window redirect
 */
export async function navigateToCheckout(
  url: string, 
  isInWalletApp: boolean, 
  openUrl: (url: string) => Promise<void>
): Promise<void> {
  if (isInWalletApp) {
    // Wallet app: use Farcaster SDK to open in external browser
    await openUrl(url);
  } else {
    // Web: use normal redirect
    window.location.href = url;
  }
}

