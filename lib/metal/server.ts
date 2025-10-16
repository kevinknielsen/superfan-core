import { MetalPresalesServer } from "metal-presale/server";

let metalServer: MetalPresalesServer | null = null;

function getMetalServer(): MetalPresalesServer {
  if (metalServer) return metalServer;
  
  const publicKey = process.env.NEXT_PUBLIC_METAL_PUBLIC_KEY;
  const secretKey = process.env.METAL_SECRET_KEY;

  if (!publicKey || !secretKey) {
    throw new Error(
      "Both NEXT_PUBLIC_METAL_PUBLIC_KEY and METAL_SECRET_KEY environment variables are required for Metal server integration"
    );
  }

  metalServer = new MetalPresalesServer({
    publicApiKey: publicKey,
    secretApiKey: secretKey,
  });
  
  return metalServer;
}

// Export a proxy that lazily initializes the server
export const metal = new Proxy({} as MetalPresalesServer, {
  get(_target, prop) {
    const server = getMetalServer();
    return (server as any)[prop];
  }
});
