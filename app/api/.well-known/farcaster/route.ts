import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Determine the base URL based on the hostname
  const hostname = request.headers.get('host') || '';
  
  let baseUrl = 'https://superfan.one';
  
  // Check if it's staging
  if (hostname.includes('staging.superfan.one')) {
    baseUrl = 'https://staging.superfan.one';
  }
  // Check if it's a Vercel preview
  else if (hostname.includes('vercel.app')) {
    baseUrl = `https://${hostname}`;
  }
  
  const manifest = {
    accountAssociation: {
      header: "eyJmaWQiOjEwOTkxNjQsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgwMjgwOTI0YWVkNzI1Y2RhMTE2OGEwMkEyNDBkQTlGOTIwNEYzODFiIn0",
      payload: "eyJkb21haW4iOiJzdXBlcmZhbi5vbmUifQ",
      signature: "MHg2MTBjMjkyNmM5Zjk4MDZiOTJiNzQ1YmUwMTNiODNlYzhhMmU0YmE0ZWFjYTgwNDlmN2YzOTkyYzM1ZjVmNWQwMDRiOWI5MmU2NDMyOTkyZWFhZTQ4MWZmYzc4YWM5NDE0NTQyM2RiZGQwZDEyNWEyMzNlMjM3ZTVjNzc3NjI2MTFj"
    },
    baseBuilder: {
      allowedAddresses: ["0x84d572a4c4Ba9164a908c1DD2cD584FDC156E711"]
    },
    miniapp: {
      version: "1",
      name: "Superfan",
      imageUrl: `${baseUrl}/og-image.png`,
      homeUrl: baseUrl,
      iconUrl: `${baseUrl}/favicon.png`,
      splashImageUrl: `${baseUrl}/splash-new.png`,
      splashBackgroundColor: "#0E0E14",
      webhookUrl: `${baseUrl}/api/farcaster/webhook`,
      buttonTitle: "🎵 Invest In Culture",
      subtitle: "The Loyalty Rail for Culture",
      description: "Superfan turns fan engagement into points, tiers, and campaigns. Join clubs, earn status by showing up online and IRL, and help launch vinyl, merch, and presales.",
      screenshotUrls: [
        `${baseUrl}/og-image.png`
      ],
      primaryCategory: "music",
      tags: ["music", "clubs", "membership", "points", "campaigns"],
      heroImageUrl: `${baseUrl}/og-image.png`,
      tagline: "Invest in Culture",
      ogTitle: "Superfan: Culture Memberships",
      ogDescription: "Join artist clubs, earn points by engaging, and power campaigns.",
      ogImageUrl: `${baseUrl}/og-image.png`,
      noindex: "false",
      castShareUrl: baseUrl
    }
  };
  
  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
    }
  });
}

