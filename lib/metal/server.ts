import { MetalPresalesServer } from "metal-presale/server";

export const metal = new MetalPresalesServer({
  publicApiKey: process.env.NEXT_PUBLIC_METAL_PUBLIC_KEY!,
  secretApiKey: process.env.METAL_SECRET_KEY!,
});
