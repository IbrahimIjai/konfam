import { NearConnector } from "@hot-labs/near-connect";
import { base64 } from "@scure/base";
import { AUTH_RECIPIENT, AUTH_TTL_MS, buildSessionMessage, encodeAuthToken } from "@konfam/shared";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { config } from "@/config";
import type { TransactionRequest } from "@/lib/near";

interface StoredSession {
  header: string;
  expiresAt: number;
}

interface WalletContextValue {
  accountId: string | null;
  ready: boolean;
  hasSession: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (transactions: TransactionRequest[]) => Promise<unknown[]>;
  authHeader: () => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function sessionKey(accountId: string) {
  return `konfam:session:${config.networkId}:${accountId}`;
}

function readSession(accountId: string): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(accountId));
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function writeSession(accountId: string, session: StoredSession | null) {
  try {
    if (session) sessionStorage.setItem(sessionKey(accountId), JSON.stringify(session));
    else sessionStorage.removeItem(sessionKey(accountId));
  } catch {}
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const connector = useMemo(() => {
    if (!connectorRef.current) {
      connectorRef.current = new NearConnector({
        network: config.networkId,
        features: config.networkId === "testnet" ? { testnet: true } : {},
        footerBranding: null,
      });
    }
    return connectorRef.current;
  }, []);

  useEffect(() => {
    const onSignIn = (event: { accounts: { accountId: string }[] }) => {
      const next = event.accounts[0]?.accountId ?? null;
      setAccountId(next);
      setHasSession(next ? readSession(next) !== null : false);
    };
    const onSignOut = () => {
      setAccountId(null);
      setHasSession(false);
    };
    connector.on("wallet:signIn", onSignIn);
    connector.on("wallet:signOut", onSignOut);
    connector
      .getConnectedWallet()
      .then(({ accounts }) => onSignIn({ accounts }))
      .catch(() => undefined)
      .finally(() => setReady(true));
    return () => {
      connector.off?.("wallet:signIn", onSignIn);
      connector.off?.("wallet:signOut", onSignOut);
    };
  }, [connector]);

  const connect = useCallback(async () => {
    await connector.connect();
  }, [connector]);

  const disconnect = useCallback(async () => {
    if (accountId) writeSession(accountId, null);
    await connector.disconnect();
    setAccountId(null);
    setHasSession(false);
  }, [connector, accountId]);

  const send = useCallback(
    async (transactions: TransactionRequest[]) => {
      if (!accountId) throw new Error("Connect a wallet first");
      const wallet = await connector.wallet();
      return wallet.signAndSendTransactions({
        network: config.networkId,
        signerId: accountId,
        transactions: transactions as never,
      });
    },
    [connector, accountId],
  );

  const authHeader = useCallback(async () => {
    if (!accountId) throw new Error("Connect a wallet first");
    const cached = readSession(accountId);
    if (cached && cached.expiresAt - Date.now() > 60_000) return cached.header;
    const wallet = await connector.wallet();
    const message = buildSessionMessage(accountId, config.networkId);
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const signed = await wallet.signMessage({ message, recipient: AUTH_RECIPIENT, nonce, network: config.networkId, signerId: accountId });
    const header = encodeAuthToken({
      accountId: signed.accountId || accountId,
      publicKey: signed.publicKey,
      signature: signed.signature,
      message,
      nonce: base64.encode(nonce),
    });
    writeSession(accountId, { header, expiresAt: Date.now() + AUTH_TTL_MS });
    setHasSession(true);
    return header;
  }, [connector, accountId]);

  const value = useMemo(
    () => ({ accountId, ready, hasSession, connect, disconnect, send, authHeader }),
    [accountId, ready, hasSession, connect, disconnect, send, authHeader],
  );

  return <WalletContext value={value}>{children}</WalletContext>;
}

export function useWallet(): WalletContextValue {
  const context = use(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
