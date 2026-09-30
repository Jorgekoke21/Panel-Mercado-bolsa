"use client";

import { ErrorState } from "@/components/states/error-state";
import { useI18n } from "@/i18n/provider";
import { classifyViewError } from "./error-classification";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { messages } = useI18n();
  const kind = classifyViewError(error);
  const copy = kind === "data"
    ? { title: messages.states.dataErrorTitle, description: messages.states.dataErrorDescription }
    : kind === "configuration"
      ? { title: messages.states.configurationErrorTitle, description: messages.states.configurationErrorDescription }
      : { title: messages.states.renderErrorTitle, description: messages.states.renderErrorDescription };
  return (
    <div className="p-2">
      <ErrorState
        title={copy.title}
        description={
          <>
            <p>{copy.description}</p>
            {error.digest && <p className="mt-1 font-mono text-fg-muted">Ref: {error.digest}</p>}
          </>
        }
        action={
          <button type="button" onClick={() => retry()} className="rounded-[3px] border border-border-strong px-2 py-1 text-2xs font-semibold text-fg uppercase hover:bg-surface-hover">
            {messages.common.retry}
          </button>
        }
      />
    </div>
  );
}
