import * as Crypto from 'expo-crypto';

export type ProofTradeOutcome = 'COMPLETED' | 'DISPUTED' | 'CANCELLED';
export type ReceiptState = 'DRAFT' | 'PROPOSED' | 'PARTY_A_SIGNED' | 'FULLY_SIGNED' | 'REJECTED' | 'CANCELLED' | 'DISPUTED';

export interface CloakIdentity {
  id: string;
  displayName: string;
  npub: string;
  publicKey: string;
  establishedMonths: number;
  relationship: 'Unknown' | 'Known';
  networkPath?: string;
}

export interface ProofTradeReceipt {
  version: 'prooftrade-v0.1';
  tradeId: string;
  partyA: string;
  partyB: string;
  createdAt: string;
  completedAt: string;
  outcome: ProofTradeOutcome;
  nonce: string;
  metadataCommitment?: string;
  settlementCommitment?: string;
  state: ReceiptState;
  signatures: {
    partyA?: string;
    partyB?: string;
  };
}

export interface DisclosurePackage {
  version: 'cloak-disclosure-v0.1';
  subject: string;
  recipient: string;
  receipts: ProofTradeReceipt[];
  createdAt: string;
  nonce: string;
  signature: string;
}

export interface ReceiptVerification {
  receiptId: string;
  integrityValid: boolean;
  partyASignatureValid: boolean;
  partyBSignatureValid: boolean;
  bothPartiesSigned: boolean;
  subjectMatches: boolean;
  duplicate: boolean;
  valid: boolean;
}

export interface DisclosureVerification {
  validCount: number;
  duplicateCount: number;
  results: ReceiptVerification[];
}

const KEY_SECRETS: Record<string, string> = {
  cloak_alice: 'demo-secret-alice-only-for-local-fixtures',
  cloak_bob_legit: 'demo-secret-bob-legit-only-for-local-fixtures',
  cloak_musa: 'demo-secret-musa-only-for-local-fixtures',
  cloak_amina: 'demo-secret-amina-only-for-local-fixtures',
  cloak_clone: 'demo-secret-clone-only-for-local-fixtures',
};

export const localIdentity: CloakIdentity = {
  id: 'cloak_alice',
  displayName: 'Alice',
  npub: 'npub1alice9r4l6wxyprivatebydefault',
  publicKey: 'cloak_alice',
  establishedMonths: 9,
  relationship: 'Known',
  networkPath: 'You',
};

export const people: CloakIdentity[] = [
  {
    id: 'cloak_bob_legit',
    displayName: 'Bob Electronics',
    npub: 'npub1bobelectronics7q8history',
    publicKey: 'cloak_bob_legit',
    establishedMonths: 14,
    relationship: 'Known',
    networkPath: 'You -> Musa -> Bob',
  },
  {
    id: 'cloak_clone',
    displayName: 'Bob Electronics',
    npub: 'npub1bobelectronicsclone0fresh',
    publicKey: 'cloak_clone',
    establishedMonths: 1,
    relationship: 'Unknown',
  },
];

function canonicalReceipt(receipt: ProofTradeReceipt) {
  return JSON.stringify({
    version: receipt.version,
    tradeId: receipt.tradeId,
    partyA: receipt.partyA,
    partyB: receipt.partyB,
    createdAt: receipt.createdAt,
    completedAt: receipt.completedAt,
    outcome: receipt.outcome,
    nonce: receipt.nonce,
    metadataCommitment: receipt.metadataCommitment ?? null,
    settlementCommitment: receipt.settlementCommitment ?? null,
  });
}

async function sha256(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

async function sign(publicKey: string, commitment: string) {
  return sha256(`${KEY_SECRETS[publicKey]}:${commitment}`);
}

export async function receiptCommitment(receipt: ProofTradeReceipt) {
  return sha256(canonicalReceipt(receipt));
}

async function signedReceipt(input: Omit<ProofTradeReceipt, 'signatures' | 'state'>): Promise<ProofTradeReceipt> {
  const draft: ProofTradeReceipt = { ...input, state: 'FULLY_SIGNED', signatures: {} };
  const commitment = await receiptCommitment(draft);
  return {
    ...draft,
    signatures: {
      partyA: await sign(draft.partyA, commitment),
      partyB: await sign(draft.partyB, commitment),
    },
  };
}

export async function buildDemoDisclosures() {
  const r1 = await signedReceipt({
    version: 'prooftrade-v0.1',
    tradeId: 'pt_2b7c9d01',
    partyA: 'cloak_bob_legit',
    partyB: 'cloak_musa',
    createdAt: '2026-06-12T10:40:00.000Z',
    completedAt: '2026-06-12T12:10:00.000Z',
    outcome: 'COMPLETED',
    nonce: '88b1d450',
    metadataCommitment: await sha256('phone repair metadata kept private'),
    settlementCommitment: await sha256('lightning settlement evidence kept private'),
  });
  const r2 = await signedReceipt({
    version: 'prooftrade-v0.1',
    tradeId: 'pt_7cf3a210',
    partyA: 'cloak_amina',
    partyB: 'cloak_bob_legit',
    createdAt: '2026-07-18T09:00:00.000Z',
    completedAt: '2026-07-18T09:44:00.000Z',
    outcome: 'COMPLETED',
    nonce: 'ab190df4',
    metadataCommitment: await sha256('accessory sale metadata kept private'),
  });
  const r3 = await signedReceipt({
    version: 'prooftrade-v0.1',
    tradeId: 'pt_b9a460ea',
    partyA: 'cloak_bob_legit',
    partyB: 'cloak_alice',
    createdAt: '2026-09-21T16:20:00.000Z',
    completedAt: '2026-09-21T16:55:00.000Z',
    outcome: 'COMPLETED',
    nonce: '4aa93c72',
  });
  const tampered: ProofTradeReceipt = { ...r2, partyB: 'cloak_clone' };
  const receipts = [r1, r2, r3, r1];
  return {
    bob: {
      version: 'cloak-disclosure-v0.1' as const,
      subject: 'cloak_bob_legit',
      recipient: localIdentity.publicKey,
      receipts,
      createdAt: '2026-10-02T09:30:00.000Z',
      nonce: 'proof-request-demo-01',
      signature: await sha256(`cloak_bob_legit:${receipts.map((r) => r.tradeId).join(':')}`),
    },
    clone: {
      version: 'cloak-disclosure-v0.1' as const,
      subject: 'cloak_clone',
      recipient: localIdentity.publicKey,
      receipts: [],
      createdAt: '2026-10-02T09:35:00.000Z',
      nonce: 'proof-request-demo-02',
      signature: await sha256('cloak_clone:empty'),
    },
    tampered: {
      version: 'cloak-disclosure-v0.1' as const,
      subject: 'cloak_bob_legit',
      recipient: localIdentity.publicKey,
      receipts: [tampered],
      createdAt: '2026-10-02T09:40:00.000Z',
      nonce: 'proof-request-demo-03',
      signature: await sha256('cloak_bob_legit:tampered'),
    },
  };
}

export async function verifyDisclosure(pkg: DisclosurePackage): Promise<DisclosureVerification> {
  const seen = new Set<string>();
  const results: ReceiptVerification[] = [];

  for (const receipt of pkg.receipts) {
    const commitment = await receiptCommitment(receipt);
    const receiptId = await sha256(commitment);
    const duplicate = seen.has(receiptId);
    seen.add(receiptId);
    const expectedA = await sign(receipt.partyA, commitment);
    const expectedB = await sign(receipt.partyB, commitment);
    const partyASignatureValid = receipt.signatures.partyA === expectedA;
    const partyBSignatureValid = receipt.signatures.partyB === expectedB;
    const subjectMatches = receipt.partyA === pkg.subject || receipt.partyB === pkg.subject;
    const bothPartiesSigned = Boolean(receipt.signatures.partyA && receipt.signatures.partyB);
    const integrityValid = receipt.version === 'prooftrade-v0.1' && receipt.state === 'FULLY_SIGNED';
    results.push({
      receiptId,
      integrityValid,
      partyASignatureValid,
      partyBSignatureValid,
      bothPartiesSigned,
      subjectMatches,
      duplicate,
      valid: integrityValid && partyASignatureValid && partyBSignatureValid && bothPartiesSigned && subjectMatches && !duplicate,
    });
  }

  return {
    validCount: results.filter((r) => r.valid).length,
    duplicateCount: results.filter((r) => r.duplicate).length,
    results,
  };
}
