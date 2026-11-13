import { Hono } from "hono";
import type { AttestationInfo } from "@konfam/shared";
import type { AppDeps } from "../deps";

export function attestationRoutes(deps: AppDeps) {
  return new Hono().get("/attestation", async (c) => {
    const agentAccountId = deps.chain.agentAccountId();
    const [info, registration] = await Promise.all([
      deps.chain.getContractInfo().catch(() => null),
      deps.chain.getAgent(agentAccountId).catch(() => null),
    ]);
    const body: AttestationInfo = {
      agentAccountId,
      contractId: deps.chain.contractId(),
      networkId: deps.config.NETWORK_ID,
      inTee: deps.chain.inTee(),
      requiresTee: info?.requires_tee ?? false,
      bankProvider: deps.bank.name,
      registration,
      codeVersion: deps.config.CODE_VERSION,
    };
    return c.json(body);
  });
}
