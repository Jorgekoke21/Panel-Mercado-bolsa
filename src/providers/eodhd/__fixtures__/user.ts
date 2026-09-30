/**
 * Respuestas de EODHD `/user` ANONIMIZADAS (nombre y email sustituidos). Solo para tests.
 *
 *   * FREE: campos del plan tal como los devolvió una cuenta gratuita real el 2026-09-29.
 *   * PAID: ejemplo SINTÉTICO de una cuenta de pago. El nombre exacto del subscriptionType de
 *     los planes de pago no está verificado; el preflight no depende de él (sondea capacidades).
 */
export const EODHD_USER_FREE = {
  name: "REDACTED",
  email: "redacted@example.invalid",
  subscriptionType: "free",
  paymentMethod: "Not Available",
  apiRequests: 0,
  apiRequestsDate: "1970-01-01",
  dailyRateLimit: 20,
  extraLimit: 500,
  inviteToken: null,
  inviteTokenClicked: 0,
  subscriptionMode: "free",
  canManageOrganizations: false,
};

export const EODHD_USER_PAID_SYNTHETIC = {
  name: "REDACTED",
  email: "redacted@example.invalid",
  subscriptionType: "monthly",
  paymentMethod: "Card",
  apiRequests: 120,
  apiRequestsDate: "2026-09-29",
  dailyRateLimit: 100000,
  extraLimit: 0,
  subscriptionMode: "paid",
};
