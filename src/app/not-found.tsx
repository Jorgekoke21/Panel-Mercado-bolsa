import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { getServerMessages } from "@/i18n/server";

export default async function NotFound() {
  const { messages } = await getServerMessages();
  return (
    <div className="p-2">
      <div className="rounded-card border-2 border-border-brand bg-surface">
        <EmptyState
          title={messages.common.notFound}
          description={messages.states.notFoundDescription}
          action={
            <Link href="/companies" className="text-2xs font-semibold text-link uppercase hover:underline">
              {messages.states.browseCompanies}
            </Link>
          }
        />
      </div>
    </div>
  );
}
