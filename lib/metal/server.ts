import { MetalPresalesServer } from "metal-presale/server";

const publicKey = process.env.NEXT_PUBLIC_METAL_PUBLIC_KEY;
const secretKey = process.env.METAL_SECRET_KEY;

if (!publicKey || !secretKey) {
  throw new Error(
    "Both NEXT_PUBLIC_METAL_PUBLIC_KEY and METAL_SECRET_KEY environment variables are required for Metal server integration"
  );
}

export const metal = new MetalPresalesServer({
  publicApiKey: publicKey,
  secretApiKey: secretKey,
});
