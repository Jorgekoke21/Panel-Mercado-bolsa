import { formatDateTime } from "@/lib/format";
import { ImpactBadge, type ImpactDirection } from "./impact-badge";

/**
 * Contrato visual de una noticia (Fase 4). En Fase 1 no hay noticias reales: solo se usa en
 * la galería de componentes con contenido de ejemplo claramente marcado.
 */
export interface NewsCardProps {
  title: string;
  summary: string | null;
  source: string;
  url: string;
  publishedAt: string;
  impact?: ImpactDirection;
}

export function NewsCard({ title, summary, source, url, publishedAt, impact }: NewsCardProps) {
  return (
    <article className="flex flex-col gap-1 border-b border-border/60 px-2.5 py-2 last:border-b-0">
      <div className="flex items-center gap-2 text-[10px] text-fg-muted">
        <span className="font-semibold uppercase">{source}</span>
        <time dateTime={publishedAt}>{formatDateTime(publishedAt)}</time>
        {impact && <ImpactBadge direction={impact} />}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-fg hover:text-accent">
        {title}
      </a>
      {summary && <p className="line-clamp-2 text-2xs text-fg-secondary">{summary}</p>}
    </article>
  );
}
