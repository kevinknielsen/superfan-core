import sdk from '@farcaster/frame-sdk';
import { SwitchChainError, fromHex, getAddress, numberToHex } from 'viem';
import { ChainNotConfiguredError, createConnector } from 'wagmi';

export function frameConnector() {
  return createConnector<typeof sdk.wallet.ethProvider>((config) => {
    let connected = false;

    const connector = {
      id: 'farcaster' as const,
      name: 'Farcaster Wallet',
      type: 'frameConnector' as const,

      async setup() {
        console.log('🚀 [frameConnector] Setup called');
        try {
          await this.connect({ chainId: config.chains[0].id });
          console.log('✅ [frameConnector] Setup completed successfully');
        } catch (error) {
          console.error('❌ [frameConnector] Setup failed:', error);
          throw error;
        }
      },
    
      async connect({ chainId }: { chainId?: number } = {}) {
        console.log('🔗 [frameConnector] Connect called with chainId:', chainId);
        try {
          const provider = await this.getProvider();
          console.log('📱 [frameConnector] Provider obtained:', !!provider);
          
          const accounts = await provider.request({
            method: 'eth_requestAccounts',
          });
          console.log('👤 [frameConnector] Accounts received:', accounts);

          let currentChainId = await this.getChainId();
          console.log('⛓️ [frameConnector] Current chain ID:', currentChainId);
          
          if (chainId && currentChainId !== chainId) {
            console.log('🔄 [frameConnector] Switching to chain:', chainId);
            const chain = await this.switchChain!({ chainId });
            currentChainId = chain.id;
          }

          connected = true;
          
          const result = {
            accounts: accounts.map((x: string) => getAddress(x)),
            chainId: currentChainId,
          };
          console.log('✅ [frameConnector] Connect successful:', result);
          
          return result;
        } catch (error) {
          console.error('❌ [frameConnector] Connect failed:', error);
          throw error;
        }
      },

      async disconnect() {
        console.log('🔌 [frameConnector] Disconnect called');
        config.emitter.emit('disconnect');
        connected = false;
      },
      
      async getAccounts() {
        if (!connected) throw new Error('Not connected');
        const provider = await this.getProvider();
        const accounts = await provider.request({
          method: 'eth_requestAccounts',
        });
        return accounts.map((x) => getAddress(x));
      },
      
      async getChainId() {
        try {
          const provider = await this.getProvider();
          const hexChainId = await provider.request({ method: 'eth_chainId' });
          return fromHex(hexChainId, 'number');
        } catch (error) {
          console.error('❌ [frameConnector] getChainId failed:', error);
          throw error;
        }
      },
      
      async isAuthorized() {
        if (!connected) {
          return false;
        }

        try {
          const accounts = await this.getAccounts();
          return !!accounts.length;
        } catch (error) {
          console.error('❌ [frameConnector] isAuthorized failed:', error);
          return false;
        }
      },
      
      async switchChain({ chainId }: { chainId: number }) {
        try {
          const provider = await this.getProvider();
          const chain = config.chains.find((x) => x.id === chainId);
          if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());

          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: numberToHex(chainId) }],
          });
          return chain;
        } catch (error) {
          console.error('❌ [frameConnector] switchChain failed:', error);
          throw error;
        }
      },
      
      async onAccountsChanged(accounts: string[]) {
        if (accounts.length === 0) await this.onDisconnect();
        else
          config.emitter.emit('change', {
            accounts: accounts.map((x: string) => getAddress(x)),
          });
      },
      
      onChainChanged(chain: string) {
        const chainId = Number(chain);
        config.emitter.emit('change', { chainId });
      },
      
      async onDisconnect() {
        config.emitter.emit('disconnect');
        connected = false;
      },
      
      async getProvider() {
        return sdk.wallet.ethProvider;
      },
    };

    return connector;
  });
} 