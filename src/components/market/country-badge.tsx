import { Badge } from "@/components/ui/badge";

/** País como código ISO (sin banderas: el código es inequívoco y no depende de emojis). */
export function CountryBadge({ code, name }: { code: string | null; name?: string | null }) {
  if (!code) return <span className="text-fg-muted">—</span>;
  return (
    <Badge variant="outline" title={name ?? code}>
      {code}
    </Badge>
  );
}
