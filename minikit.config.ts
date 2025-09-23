const ROOT_URL = process.env.NODE_ENV === 'production' 
  ? (process.env.NEXT_PUBLIC_APP_URL || 'https://superfan.one')
  : 'http://localhost:3000';

export const minikitConfig = {
  accountAssociation: {
    "header": "eyJmaWQiOjEwOTkxNjQsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgwMjgwOTI0YWVkNzI1Y2RhMTE2OGEwMkEyNDBkQTlGOTIwNEYzODFiIn0",
    "payload": "eyJkb21haW4iOiJzdXBlcmZhbi5vbmUifQ==",
    "signature": "MHgyZjYzYmM0ZTk5YmZjNDMxYWU2NzkzYWI0YzFjNDFhNjA2NGI3MjEyYzdmNDAwYjdmZDkyMjg1YTJlZjczNTFmNDllZTZjMjc5YmYwYTMyMzE3NjI2ZGQ3YjVkZWJlM2VlNzM1MDE1M2RjOGE0ZDI3OTVmZjNjYWU1ZTk4YmU0ODFj"
  },
  miniapp: {
    version: "1",
    name: "Superfan",
    subtitle: "The Loyalty Rail for Culture",
    description: "Superfan turns fan engagement into points, tiers, and campaigns. Join clubs, earn status by showing up online and IRL, and help launch vinyl, merch, and presales.",
    screenshotUrls: [`${ROOT_URL}/screenshot-portrait.png`],
    iconUrl: `${ROOT_URL}/favicon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#9C26B0",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/farcaster/webhook`,
    primaryCategory: "music",
    tags: ["music", "clubs", "membership", "points", "campaigns"],
    heroImageUrl: `${ROOT_URL}/og-image.png`,
    tagline: "Engagement Becomes Economy",
    ogTitle: "Superfan: Culture Memberships",
    ogDescription: "Join artist clubs, earn points by engaging, and power campaigns.",
    ogImageUrl: `${ROOT_URL}/og-image.png`,
    buttonTitle: "🎵 Join A Club",
    noindex: false,
  },
} as const;
