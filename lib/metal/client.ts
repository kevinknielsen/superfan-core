import { MetalPresalesClient } from "metal-presale";

let metalClient: MetalPresalesClient | null = null;

function getMetalClient(): MetalPresalesClient {
  if (metalClient) return metalClient;
  
  const publicKey = process.env.NEXT_PUBLIC_METAL_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error(
      "NEXT_PUBLIC_METAL_PUBLIC_KEY environment variable is required for Metal integration"
    );
  }

  metalClient = new MetalPresalesClient({
    publicApiKey: publicKey,
    apiBasePath: "/api/metal",
  });
  
  return metalClient;
}

// Export a proxy that lazily initializes the client
export const metal = new Proxy({} as MetalPresalesClient, {
  get(_target, prop) {
    const client = getMetalClient();
    return (client as any)[prop];
  }
});
