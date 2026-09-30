import { Badge } from "@/components/ui/badge";

/**
 * Relación POTENCIAL entre un evento y un activo (Fase 5). Nunca se afirma causalidad:
 * el lenguaje es siempre "potential" o "uncertain/mixed".
 */
export type ImpactDirection = "potential_positive" | "potential_negative" | "mixed_uncertain";

const CONFIG: Record<ImpactDirection, { label: string; variant: "positive" | "negative" | "neutral"; symbol: string }> = {
  potential_positive: { label: "Potential positive", variant: "positive", symbol: "↗" },
  potential_negative: { label: "Potential negative", variant: "negative", symbol: "↘" },
  mixed_uncertain: { label: "Mixed / uncertain", variant: "neutral", symbol: "↔" },
};

export function ImpactBadge({ direction }: { direction: ImpactDirection }) {
  const { label, variant, symbol } = CONFIG[direction];
  return (
    <Badge variant={variant} title="Potential relationship — not a guaranteed outcome">
      <span aria-hidden>{symbol}</span>
      {label}
    </Badge>
  );
}
