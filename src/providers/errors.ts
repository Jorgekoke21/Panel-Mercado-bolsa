/**
 * Errores tipados de proveedor.
 *
 * Un fallo del proveedor NUNCA se convierte en 0, [] o null: se lanza un ProviderError y el
 * job lo registra en `sync_runs`. Los mensajes jamás contienen credenciales (ver `redact`).
 */
export const PROVIDER_ERROR_KINDS = ["rate_limited", "not_found", "auth", "transient", "invalid_response"] as const;

export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

export class ProviderError extends Error {
  override name = "ProviderError";

  constructor(
    readonly kind: ProviderErrorKind,
    readonly provider: string,
    /** Operación o ruta SIN query string (nunca la URL con credenciales). */
    readonly operation: string,
    message: string,
    readonly details: { status?: number; retryAfterMs?: number } = {},
  ) {
    super(`[${provider}] ${kind} · ${operation}: ${message}`);
  }

  /** Errores que merece la pena reintentar con espera. */
  get retryable(): boolean {
    return this.kind === "transient" || this.kind === "rate_limited";
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

/** Sustituye cualquier aparición de los secretos por "***". */
export function redact(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("***");
  }
  return out;
}
