import { QueuedTransaction } from '@/lib/state/LocalStateEngine';

/**
 * MOCKED. There is no deployed ShadowPayEscrow contract or Monad RPC endpoint
 * in this build — this client simulates the parallel batch-settlement call
 * described in the spec (delay + a fake tx hash) so the sync flow is
 * demonstrable end-to-end. Swap this out for a real ethers/viem call once
 * contracts/ShadowPayEscrow.sol is deployed to a live Monad RPC.
 */

export interface SettlementResult {
  txHash: string;
  settledCount: number;
  totalVolume: number;
}

function fakeTxHash(): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) hash += chars[Math.floor(Math.random() * chars.length)];
  return hash;
}

export class MonadSettlementClient {
  public static async settleBatch(batch: QueuedTransaction[]): Promise<SettlementResult> {
    if (batch.length === 0) throw new Error('Empty batch');

    return new Promise((resolve) => {
      setTimeout(() => {
        const totalVolume = batch.reduce((sum, tx) => sum + parseFloat(tx.amount || '0'), 0);
        resolve({ txHash: fakeTxHash(), settledCount: batch.length, totalVolume });
      }, 1400);
    });
  }
}
