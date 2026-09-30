"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Si se indica, el hueco es una funcionalidad futura ("Coming in Phase 4/5"). */
  phase?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ title, description, phase, action, className, compact }: EmptyStateProps) {
  const { messages } = useI18n();
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 text-center",
        compact ? "px-3 py-4" : "px-4 py-8",
        className,
      )}
    >
      {phase && <Badge variant="outline">{messages.navigation.availableInPhase.replace("{phase}", phase)}</Badge>}
      <p className="text-xs font-semibold text-fg-secondary">{title}</p>
      {description && <p className="max-w-md text-2xs text-fg-muted">{description}</p>}
      {action}
    </div>
  );
}
