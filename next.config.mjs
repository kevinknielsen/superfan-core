/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Handle QR scanner library properly
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    // Ensure proper handling of worker files
    config.module.rules.push({
      test: /\.worker\.(js|ts)$/,
      use: {
        loader: 'worker-loader',
        options: {
          inline: 'fallback',
        },
      },
    });

    return config;
  },
  async redirects() {
    return [
      // Remove farcaster.json redirect - serve static file from /public/.well-known/
      {
        source: '/projects',
        has: [{ type: 'query', key: 'projectId' }],
        destination: '/projects/:projectId',
        permanent: true,
      },
    ];
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    // More robust preview detection
    const isVercelPreview = process.env.VERCEL_ENV === 'preview' || 
                           !!process.env.VERCEL_URL ||
                           !!process.env.VERCEL_GIT_COMMIT_REF ||
                           process.env.VERCEL === '1';
    // Only production if explicitly set AND not a preview/development
    const isProduction = process.env.NODE_ENV === 'production' && 
                         process.env.VERCEL_ENV === 'production' &&
                         !isVercelPreview && 
                         !isDev;
    const isDevOrPreview = isDev || isVercelPreview || !isProduction;
    
    // Debug logging (development/preview only)
    if (isDevOrPreview) {
      console.log('CSP Environment Check:', {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        VERCEL_URL: !!process.env.VERCEL_URL,
        VERCEL: process.env.VERCEL,
        isDev,
        isVercelPreview,
        isProduction,
        isDevOrPreview
      });
    }
    
    // Development and Preview CSP is more permissive for hot reloading, debugging, and Vercel features
    const scriptSrc = isDevOrPreview 
      ? "'self' 'unsafe-eval' 'unsafe-inline' https://auth.privy.io https://verify.walletconnect.com https://registry.walletconnect.com https://vercel.live https://*.vercel.app https://*.vercel.com https://farcaster.xyz https://www.googletagmanager.com https://www.google-analytics.com"
      : "'self' https://auth.privy.io https://verify.walletconnect.com https://registry.walletconnect.com https://superfan.one https://farcaster.xyz https://www.googletagmanager.com https://www.google-analytics.com";
    
    const styleSrc = isDevOrPreview
      ? "'self' 'unsafe-inline' https://*.vercel.app https://*.vercel.com https://fonts.googleapis.com"
      : "'self' 'unsafe-inline' https://fonts.googleapis.com https://superfan.one"; // Still needed for CSS-in-JS and dynamic styles
    
    return [
      {
        // No-cache headers for Farcaster manifest to prevent stale data
        source: '/.well-known/farcaster.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc}`,
              `style-src ${styleSrc}`,
              "img-src 'self' data: https: blob:",
              "font-src 'self' data: https: https://fonts.gstatic.com",
              "media-src 'self' data: https: blob: https://*.supabase.co",
              "connect-src 'self' https: wss: data: https://vercel.live https://*.vercel.app https://*.vercel.com https://*.supabase.co https://farcaster.xyz https://client.farcaster.xyz https://warpcast.com https://client.warpcast.com https://wrpcd.net https://*.wrpcd.net https://proxy.wrpcd.net https://privy.farcaster.xyz https://privy.warpcast.com https://auth.privy.io https://*.rpc.privy.systems https://cloudflareinsights.com https://explorer-api.walletconnect.com https://*.walletconnect.com https://www.google-analytics.com https://analytics.google.com https://*.googletagmanager.com",
              "frame-src 'self' https://auth.privy.io https://verify.walletconnect.com https://vercel.live https://farcaster.xyz https://wallet.coinbase.com https://*.coinbase.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self' https://farcaster.xyz https://*.farcaster.xyz https://warpcast.com https://*.warpcast.com https://wallet.coinbase.com https://*.coinbase.com https://go.cb-w.com https://*.cb-w.com https://base.org https://*.base.org https://www.base.org https://build.base.org https://*.base.dev https://base.dev",
              "upgrade-insecure-requests",
              // CSP violation reporting (only in production)
              ...(isDevOrPreview ? [] : ["report-uri /api/csp-report"])
            ].join('; '),
          },

          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // X-XSS-Protection removed - deprecated and can cause issues in modern browsers
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // Omit X-Frame-Options entirely; CSP frame-ancestors governs embedding
          // This is critical for Farcaster and Coinbase Wallet App support
        ],
      },
    ];
  },
};

export default nextConfig;
