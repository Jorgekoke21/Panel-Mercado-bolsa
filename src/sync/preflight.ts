import { isProviderError } from "@/providers/errors";
import type { ProviderAccount, ProviderAdapter, ProviderSymbol } from "@/providers/ports";

/**
 * Preflight del proveedor: comprueba ANTES de sincronizar si la cuenta permite el piloto.
 *
 *   1. Cuenta (`/user` en EODHD, sin coste): autenticación, tipo de suscripción, límites y uso.
 *   2. Si la suscripción es conocida como insuficiente (free, demo) → BLOCKED sin gastar llamadas.
 *   3. Si no, sonda mínima de capacidades (1 barra antigua + 1 perfil de fundamentales) y cuota.
 *
 * No contiene precios de planes (cambian): solo qué capacidades ofrece cada tipo de cuenta
 * según la documentación del proveedor.
 */

export type CapabilityState = "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";

export type PilotStatus = "READY" | "BLOCKED_BY_PROVIDER_PLAN" | "BLOCKED_BY_QUOTA" | "BLOCKED_BY_AUTH" | "NEEDS_PROBE";

export interface PreflightReport {
  provider: string;
  authentication: "PASS" | "FAIL";
  subscription: string | null;
  dailyLimit: number | null;
  extraLimit: number | null;
  callsUsed: number | null;
  callsRemaining: number | null;
  eodFullHistory: CapabilityState;
  fundamentals: CapabilityState;
  requiredCredits: number;
  pilotReady: boolean;
  status: PilotStatus;
  notes: string[];
}

/** Capacidades conocidas por tipo de suscripción de EODHD (documentación pública del proveedor). */
export const EODHD_KNOWN_SUBSCRIPTIONS: Readonly<Record<string, { eodFullHistory: CapabilityState; fundamentals: CapabilityState; note: string }>> = {
  free: {
    eodFullHistory: "NOT_AVAILABLE",
    fundamentals: "NOT_AVAILABLE",
    note: "EODHD free plan: small daily call limit, ~1 year of EOD history, no fundamentals.",
  },
  demo: { eodFullHistory: "NOT_AVAILABLE", fundamentals: "NOT_AVAILABLE", note: "EODHD demo key: a handful of sample tickers only." },
  test: { eodFullHistory: "NOT_AVAILABLE", fundamentals: "NOT_AVAILABLE", note: "EODHD test/demo key: sample tickers only." },
};

export interface ProbeResult {
  eodFullHistory: CapabilityState;
  fundamentals: CapabilityState;
  creditsSpent: number;
  notes: string[];
}

/** Evaluación PURA a partir de la cuenta y (opcionalmente) de la sonda. */
export function evaluatePreflight(input: {
  provider: string;
  account: ProviderAccount | null;
  authError: string | null;
  probe: ProbeResult | null;
  requiredCredits: number;
}): PreflightReport {
  const { account, probe } = input;
  const base = {
    provider: input.provider,
    subscription: account?.subscriptionType ?? null,
    dailyLimit: account?.dailyLimit ?? null,
    extraLimit: account?.extraLimit ?? null,
    callsUsed: account?.requestsToday ?? null,
    callsRemaining: account && account.dailyLimit !== null ? Math.max(0, account.dailyLimit - account.requestsToday) : null,
    requiredCredits: input.requiredCredits,
  };
  if (!account) {
    return {
      ...base,
      authentication: "FAIL",
      eodFullHistory: "UNKNOWN",
      fundamentals: "UNKNOWN",
      pilotReady: false,
      status: "BLOCKED_BY_AUTH",
      notes: [input.authError ?? "Account information unavailable"],
    };
  }
  const known = account.subscriptionType ? EODHD_KNOWN_SUBSCRIPTIONS[account.subscriptionType.toLowerCase()] : undefined;
  const eodFullHistory = known?.eodFullHistory ?? probe?.eodFullHistory ?? "UNKNOWN";
  const fundamentals = known?.fundamentals ?? probe?.fundamentals ?? "UNKNOWN";
  const notes = [...(known ? [known.note] : []), ...(probe?.notes ?? [])];

  let status: PilotStatus;
  if (eodFullHistory === "NOT_AVAILABLE" || fundamentals === "NOT_AVAILABLE") status = "BLOCKED_BY_PROVIDER_PLAN";
  else if (eodFullHistory === "UNKNOWN" || fundamentals === "UNKNOWN") status = "NEEDS_PROBE";
  else if (base.callsRemaining !== null && base.callsRemaining < input.requiredCredits) {
    status = "BLOCKED_BY_QUOTA";
    notes.push(`Needs ~${input.requiredCredits} credits; ${base.callsRemaining} remaining today.`);
  } else status = "READY";

  return { ...base, authentication: "PASS", eodFullHistory, fundamentals, pilotReady: status === "READY", status, notes };
}

/** ¿La suscripción ya descarta el piloto sin gastar llamadas? */
export function isKnownInsufficient(account: ProviderAccount): boolean {
  const known = account.subscriptionType ? EODHD_KNOWN_SUBSCRIPTIONS[account.subscriptionType.toLowerCase()] : undefined;
  return known !== undefined && (known.eodFullHistory === "NOT_AVAILABLE" || known.fundamentals === "NOT_AVAILABLE");
}

export const PROBE_SYMBOL: ProviderSymbol = { provider: "eodhd", symbol: "AAPL.US" };

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Sonda mínima (solo si la cuenta no se sabe insuficiente):
 *   * una ventana de 2 semanas de hace ~6 años (¿histórico completo?) — 1 crédito;
 *   * el perfil de fundamentales de AAPL (¿fundamentales incluidos?) — 10 créditos; la respuesta
 *     queda en caché del adaptador y el piloto la reutiliza.
 */
export async function probeCapabilities(adapter: ProviderAdapter, now: Date): Promise<ProbeResult> {
  const notes: string[] = [];
  const cost = adapter.costModel.creditsPerCall;
  let creditsSpent = 0;
  const classify = (error: unknown, what: string): CapabilityState => {
    if (isProviderError(error) && (error.kind === "auth" || error.kind === "not_found")) {
      notes.push(`${what}: ${error.kind} (${error.details.status ?? "?"})`);
      return "NOT_AVAILABLE";
    }
    notes.push(`${what}: probe failed (${isProviderError(error) ? error.kind : "unexpected"})`);
    return "UNKNOWN";
  };

  let eodFullHistory: CapabilityState = "UNKNOWN";
  if (adapter.priceHistory) {
    const from = new Date(now);
    from.setUTCFullYear(from.getUTCFullYear() - 6);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 14);
    try {
      creditsSpent += cost.price_history ?? 0;
      const result = await adapter.priceHistory.getDailyBars(PROBE_SYMBOL, { from: isoDay(from), to: isoDay(to) });
      eodFullHistory = result.bars.length > 0 ? "AVAILABLE" : "NOT_AVAILABLE";
      if (result.bars.length === 0) notes.push("EOD history: no bars 6 years back (history depth limited by plan)");
    } catch (error) {
      eodFullHistory = classify(error, "EOD history");
    }
  }

  let fundamentals: CapabilityState = "UNKNOWN";
  if (adapter.profile) {
    try {
      creditsSpent += cost.fundamentals ?? 0;
      await adapter.profile.getProfile(PROBE_SYMBOL);
      fundamentals = "AVAILABLE";
    } catch (error) {
      fundamentals = classify(error, "Fundamentals");
    }
  }
  return { eodFullHistory, fundamentals, creditsSpent, notes };
}

export async function runPreflight(
  adapter: ProviderAdapter,
  options: { now: Date; requiredCredits: number; probe: boolean },
): Promise<PreflightReport> {
  let account: ProviderAccount | null = null;
  let authError: string | null = null;
  try {
    account = adapter.getUsage ? await adapter.getUsage() : null;
    if (!account) authError = "Provider exposes no account endpoint";
  } catch (error) {
    authError = isProviderError(error) ? `${error.kind}: ${error.message}` : "Account check failed";
  }
  const shouldProbe = options.probe && account !== null && !isKnownInsufficient(account);
  const probe = shouldProbe ? await probeCapabilities(adapter, options.now) : null;
  return evaluatePreflight({ provider: adapter.label, account, authError, probe, requiredCredits: options.requiredCredits });
}

const LABEL: Record<CapabilityState, string> = { AVAILABLE: "AVAILABLE", NOT_AVAILABLE: "NOT AVAILABLE", UNKNOWN: "UNKNOWN" };

export function renderPreflight(r: PreflightReport): string {
  const n = (v: number | null) => (v === null ? "n/a" : String(v));
  return [
    `${r.provider.toUpperCase()} PROVIDER PREFLIGHT`,
    "",
    `Authentication: ${r.authentication}`,
    `Subscription: ${r.subscription ? r.subscription.toUpperCase() : "UNKNOWN"}`,
    `Daily limit: ${n(r.dailyLimit)} · extra limit: ${n(r.extraLimit)} · used today: ${n(r.callsUsed)} · remaining: ${n(r.callsRemaining)}`,
    `EOD full history: ${LABEL[r.eodFullHistory]}`,
    `Fundamentals: ${LABEL[r.fundamentals]}`,
    `Required for pilot 5/5: ${r.pilotReady ? "READY" : "NOT READY"} (~${r.requiredCredits} credits)`,
    ...r.notes.map((note) => `  · ${note}`),
    "",
    `PILOT STATUS: ${r.status}`,
  ].join("\n");
}
