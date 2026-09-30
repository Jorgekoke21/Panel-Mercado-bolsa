import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { getServerMessages } from "@/i18n/server";

export default async function NotFound() {
  const { messages } = await getServerMessages();
  return (
    <div className="p-2">
      <div className="rounded-[4px] border border-border bg-surface">
        <EmptyState
          title={messages.common.notFound}
          description={messages.states.notFoundDescription}
          action={
            <Link href="/companies" className="text-2xs font-semibold text-accent uppercase hover:underline">
              {messages.states.browseCompanies}
            </Link>
          }
        />
      </div>
    </div>
  );
}
