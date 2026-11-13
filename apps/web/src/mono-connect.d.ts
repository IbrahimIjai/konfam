declare module "@mono.co/connect.js" {
  interface MonoConnectOptions {
    key: string;
    scope?: "auth" | "reauth" | "payments";
    data?: { customer?: { id?: string; name?: string; email?: string } };
    reference?: string;
    onSuccess: (data: { code: string }) => void;
    onClose?: () => void;
    onLoad?: () => void;
    onEvent?: (eventName: string, data: unknown) => void;
  }

  export default class Connect {
    constructor(options: MonoConnectOptions);
    setup(config?: Record<string, unknown>): void;
    open(): void;
    close(): void;
    reauthorise(code: string): void;
  }
}
