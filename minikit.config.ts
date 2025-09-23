const ROOT_URL = process.env.NODE_ENV === 'production' 
  ? (process.env.NEXT_PUBLIC_APP_URL || 'https://superfan.one')
  : 'http://localhost:3000';

export const minikitConfig = {
  accountAssociation: {
    "header": "eyJmaWQiOjEwOTkxNjQsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgwMjgwOTI0YWVkNzI1Y2RhMTE2OGEwMkEyNDBkQTlGOTIwNEYzODFiIn0",
    "payload": "eyJkb21haW4iOiJzdXBlcmZhbi5vbmUifQ",
    "signature": "MHg2MTBjMjkyNmM5Zjk4MDZiOTJiNzQ1YmUwMTNiODNlYzhhMmU0YmE0ZWFjYTgwNDlmN2YzOTkyYzM1ZjVmNWQwMDRiOWI5MmU2NDMyOTkyZWFhZTQ4MWZmYzc4YWM5NDE0NTQyM2RiZGQwZDEyNWEyMzNlMjM3ZTVjNzc3NjI2MTFj"
  },
  miniapp: {
    version: "1",
    name: "Superfan",
    homeUrl: ROOT_URL,
    iconUrl: `${ROOT_URL}/favicon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#9C26B0",
    webhookUrl: `${ROOT_URL}/api/farcaster/webhook`,
    subtitle: "The Loyalty Rail for Culture",
    description: "Superfan turns fan engagement into points, tiers, and campaigns. Join clubs, earn status by showing up online and IRL, and help launch vinyl, merch, and presales.",
    screenshotUrls: [`${ROOT_URL}/screenshot-portrait.png`],
    primaryCategory: "music",
    tags: ["music", "clubs", "membership", "points", "campaigns"],
    heroImageUrl: `${ROOT_URL}/og-image.png`,
    tagline: "Engagement Becomes Economy",
    ogTitle: "Superfan: Culture Memberships",
    ogDescription: "Join artist clubs, earn points by engaging, and power campaigns.",
    ogImageUrl: `${ROOT_URL}/og-image.png`,
    buttonTitle: "🎵 Join A Club",
    noindex: false,
    castShareUrl: ROOT_URL,
  },
} as const;
