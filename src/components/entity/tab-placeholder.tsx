import { EmptyState } from "@/components/states/empty-state";
import { Panel } from "@/components/ui/panel";

interface TabPlaceholderProps {
  title: string;
  phase: string;
  description: string;
  /** Contenido previsto (lista breve, sin datos). */
  planned: string[];
}

/** Pestaña reservada para una fase futura: estructura visible, sin datos inventados. */
export function TabPlaceholder({ title, phase, description, planned }: TabPlaceholderProps) {
  return (
    <Panel title={title}>
      <EmptyState phase={phase} title={`${title} are not available yet`} description={description} />
      <ul className="flex flex-wrap justify-center gap-1 px-4 pb-6">
        {planned.map((item) => (
          <li key={item} className="rounded-[3px] border border-border px-1.5 py-0.5 text-[10px] text-fg-muted">
            {item}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
