import { MetalPresalesClient } from "metal-presale/client";

const publicKey = process.env.NEXT_PUBLIC_METAL_PUBLIC_KEY;
if (!publicKey) {
  throw new Error(
    "NEXT_PUBLIC_METAL_PUBLIC_KEY environment variable is required for Metal integration"
  );
}

export const metal = new MetalPresalesClient({
  publicApiKey: publicKey,
  apiBasePath: "/api/metal",
});
