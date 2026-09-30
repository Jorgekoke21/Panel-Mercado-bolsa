import type { ImpactDirection } from "@/domain/news";
import type { EventType } from "@/domain/news";
import type { Horizon } from "@/knowledge/types";
import type { Locale } from "./messages";
import { eventTypeLabel, horizonLabel, mechanismLabel } from "./domain";
import { classificationLabel } from "./classification";

/** Locale-aware copy composed from stable event metadata; never translates or replaces source headlines. */
export function eventSummary(
  locale: Locale,
  type: EventType,
  articleCount: number,
  official: boolean,
  independentSources: number,
): string {
  const articles = locale === "es"
    ? `${articleCount} ${articleCount === 1 ? "artículo" : "artículos"}`
    : `${articleCount} ${articleCount === 1 ? "article" : "articles"}`;
  const sources = official
    ? (locale === "es" ? "fuente oficial" : "official source")
    : locale === "es"
      ? `${independentSources} ${independentSources === 1 ? "fuente independiente" : "fuentes independientes"}`
      : `${independentSources} independent ${independentSources === 1 ? "source" : "sources"}`;
  return `${eventTypeLabel(locale, type)} · ${articles} · ${sources}.`;
}

/**
 * A deterministic, locale-native impact explanation based on domain enums and metadata.
 * Rationale is kept in the domain/evidence model but isn't used as UI copy because it may be English.
 */
export function impactSummary(
  locale: Locale,
  direction: ImpactDirection,
  target: string,
  mechanism: string,
  horizon: Horizon,
): string {
  const via = mechanismLabel(locale, mechanism);
  const localizedTarget = classificationLabel(locale, target);
  const time = horizonLabel(locale, horizon);
  if (locale === "es") {
    const pressure = direction === "potential_positive" ? "alcista" : direction === "potential_negative" ? "bajista" : null;
    return pressure
      ? `Posible presión ${pressure} sobre ${localizedTarget} por ${via}; horizonte de ${time}. Relación potencial, no predicción.`
      : `Posible efecto mixto o incierto sobre ${localizedTarget} por ${via}; horizonte de ${time}. Relación potencial, no predicción.`;
  }
  const pressure = direction === "potential_positive" ? "upward" : direction === "potential_negative" ? "downward" : null;
  return pressure
    ? `Potential ${pressure} pressure on ${localizedTarget} via ${via}; ${time} horizon. Potential relationship, not a prediction.`
    : `Potential mixed or uncertain effect on ${localizedTarget} via ${via}; ${time} horizon. Potential relationship, not a prediction.`;
}

export function moveWithinRange(locale: Locale): string {
  return locale === "es"
    ? "El movimiento se encuentra dentro de su rango diario habitual."
    : "The move is within its normal daily range.";
}
