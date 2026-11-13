import { useCallback, useState } from "react";

const KEY = "konfam:sandbox-accounts";

export interface SavedSandboxAccount {
  id: string;
  holderName: string;
  accountNumber: string;
  bankName: string;
}

function read(): SavedSandboxAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedSandboxAccount[]) : [];
  } catch {
    return [];
  }
}

function write(accounts: SavedSandboxAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(accounts));
  } catch {}
}

export function useSandboxAccounts() {
  const [accounts, setAccounts] = useState<SavedSandboxAccount[]>(read);
  const add = useCallback((account: SavedSandboxAccount) => {
    setAccounts((current) => {
      const next = [account, ...current.filter((a) => a.id !== account.id)];
      write(next);
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => {
    setAccounts((current) => {
      const next = current.filter((a) => a.id !== id);
      write(next);
      return next;
    });
  }, []);
  return { accounts, add, remove };
}
