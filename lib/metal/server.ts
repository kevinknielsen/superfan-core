import "server-only";
import { MetalPresalesServer } from "metal-presale";

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
    const value = (server as any)[prop];
    // Bind functions to the server instance to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(server);
    }
    return value;
  }
});
