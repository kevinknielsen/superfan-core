import { MetalPresalesClient } from "metal-presale/client";

export const metal = new MetalPresalesClient({
  publicApiKey: process.env.NEXT_PUBLIC_METAL_PUBLIC_KEY!,
  apiBasePath: "/api/metal",
});
