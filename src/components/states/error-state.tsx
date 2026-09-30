import type { ReactNode } from "react";

interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function ErrorState({ title = "Something went wrong", description, action }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-[4px] border border-negative/30 bg-negative/5 px-4 py-8 text-center">
      <p className="text-xs font-semibold text-negative">{title}</p>
      {description && <div className="max-w-lg text-2xs text-fg-secondary">{description}</div>}
      {action}
    </div>
  );
}
