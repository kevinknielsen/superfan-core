import type React from "react";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "./providers";
import { inter } from "./fonts";
import RouteGuard from "@/components/route-guard";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { headers } from "next/headers";

// Dynamic metadata that uses the current request URL
export async function generateMetadata(): Promise<Metadata> {
  const siteDescription =
    "Support artists through campaigns and unlock exclusive perks with instant discounts based on your fan tier";
  const headersList = await headers();
  const forwardedHost = headersList.get('x-forwarded-host');
  const host = forwardedHost || headersList.get('host');
  const forwardedProto = headersList.get('x-forwarded-proto');
  const protocol = forwardedProto || (host && (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('.local')) ? 'http' : 'https');
  const computedBaseUrl = host ? `${protocol}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || 'https://superfan.one');
  
  // Check if this is real production (not preview)
  const isRealProduction = (process.env.NODE_ENV === 'production' && 
    (process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV) !== 'preview') ||
    (process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV) === 'production';
  
  const baseUrl = isRealProduction 
    ? (process.env.NEXT_PUBLIC_APP_URL || 'https://superfan.one')
    : computedBaseUrl;
  
  // Mini App embed configuration
  const miniAppEmbed = {
    version: "next",
    imageUrl: `${baseUrl}/og-image.png`,
    button: {
      title: "🎵 Explore Releases",
      action: {
        type: "launch_miniapp",
        url: baseUrl,
        name: "Superfan",
        splashImageUrl: `${baseUrl}/splash-new.png`,
        splashBackgroundColor: "#0E0E14"
      }
    }
  };

  // For backward compatibility, also create frame version
  const frameEmbed = {
    ...miniAppEmbed,
    button: {
      ...miniAppEmbed.button,
      action: {
        ...miniAppEmbed.button.action,
        type: "launch_frame"
      }
    }
  };
  
  return {
    title: "Superfan",
    description: siteDescription,
    generator: "v0.dev",
    icons: {
      icon: [
        { url: "/favicon.png?v=4", type: "image/png", sizes: "32x32" },
        { url: "/favicon.svg?v=4", type: "image/svg+xml", sizes: "any" }
      ],
      shortcut: "/favicon.png?v=4",
      apple: "/favicon.png?v=4",
    },
    keywords: ["music", "artists", "campaigns", "fan tiers", "exclusive perks", "music platform", "superfan", "discounts", "rewards"],
    authors: [{ name: "Superfan" }],
    creator: "Superfan",
    publisher: "Superfan",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      title: "Superfan",
      description: siteDescription,
      url: baseUrl,
      siteName: "Superfan",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "Superfan - Support artists through campaigns and unlock exclusive perks",
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@superfan",
      creator: "@superfan",
      title: "Superfan",
      description: siteDescription,
      images: {
        url: `${baseUrl}/og-image.png`,
        alt: "Superfan - Support artists through campaigns and unlock exclusive perks",
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    other: {
      // New Mini App embed format
      'fc:miniapp': JSON.stringify(miniAppEmbed),
      // For backward compatibility
      'fc:frame': JSON.stringify(frameEmbed),
      
      'msapplication-TileColor': '#8B5CF6',
    },
    themeColor: '#8B5CF6',
  };
}

// Separate viewport export as required by Next.js 14+
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png?v=4" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon.svg?v=4" type="image/svg+xml" />
      </head>
      <body
        className={`${inter.variable} antialiased bg-[#0E0E14] text-[#F0F0F0]`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>
            <RouteGuard>
              {children}
            </RouteGuard>
          </Providers>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
