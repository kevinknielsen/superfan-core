import type React from "react";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "./providers";
import { inter } from "./fonts";
import RouteGuard from "@/components/route-guard";
import "./globals.css";
import { headers } from "next/headers";

// Dynamic metadata that uses the current request URL
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const baseUrl = host ? `${protocol}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || 'https://superfan.one');
  
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
        splashImageUrl: `${baseUrl}/splash.png`,
        splashBackgroundColor: "#9C26B0"
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
    description: "Connect with artists and support music projects on the futuristic music release platform",
    generator: "v0.dev",
    keywords: ["music", "artists", "presale", "funding", "music platform", "superfan"],
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
      description: "Connect with artists and support music projects on the futuristic music release platform",
      url: baseUrl,
      siteName: "Superfan",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "Superfan - Connect with artists and support music projects",
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@superfan",
      creator: "@superfan",
      title: "Superfan",
      description: "Connect with artists and support music projects on the futuristic music release platform",
      images: {
        url: `${baseUrl}/og-image.png`,
        alt: "Superfan - Connect with artists and support music projects",
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
      
      // Theme color for mobile browsers
      'theme-color': '#8B5CF6',
      'msapplication-TileColor': '#8B5CF6',
    },
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
        </ThemeProvider>
      </body>
    </html>
  );
}
