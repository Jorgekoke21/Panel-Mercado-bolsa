import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { StatementCell, StatementColumn, StatementRow } from "@/services/company-fundamentals";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import { lineItemLabel } from "@/i18n/domain";

/**
 * Tabla de estados financieros. Cada celda explica su procedencia en el tooltip:
 *   sin marca = reportado en un filing · "d" = derivado (p. ej. Q4 = FY − 9M) · "c" = calculado por MarketRadar
 *   "—" = no disponible (con motivo) · "n/a" = no aplica a esta plantilla sectorial.
 */
function formatCell(cell: StatementCell, unit: StatementRow["unit"], locale: Locale): string {
  if (cell.value === null) return "";
  switch (unit) {
    case "currency":
      return formatCompact(cell.value, null, locale);
    case "shares":
      return formatCompact(cell.value, null, locale);
    case "per_share":
      return formatNumber(cell.value, 2, locale);
    case "percent":
      return formatPercent(cell.value, { signed: false, digits: 1 }, locale);
  }
}

const MARK: Partial<Record<NonNullable<StatementCell["origin"]>, string>> = { derived: "d", calculated: "c" };

export function StatementCellView({ cell, unit, locale = DEFAULT_LOCALE }: { cell: StatementCell; unit: StatementRow["unit"]; locale?: Locale }) {
  const title = cell.notes.join("\n");
  if (cell.state === "not_applicable") {
    return (
      <span className="text-fg-muted/70" title={title}>
        n/a
      </span>
    );
  }
  if (cell.state === "missing") {
    return (
      <span className="text-fg-muted" title={title}>
        —
      </span>
    );
  }
  const mark = cell.origin ? MARK[cell.origin] : undefined;
  return (
    <span title={title} className={cn(cell.value !== null && cell.value < 0 && "text-negative")}>
      {formatCell(cell, unit, locale)}
      {mark && <sup className="ml-0.5 text-[8px] font-semibold text-fg-muted">{mark}</sup>}
    </span>
  );
}

export function StatementTable({ title, columns, rows, locale = DEFAULT_LOCALE }: { title: string; columns: StatementColumn[]; rows: StatementRow[]; locale?: Locale }) {
  return (
    <Table caption={title}>
      <THead>
        <tr>
          <Th className="w-56">{title}</Th>
          {columns.map((c) => (
            <Th key={c.end} numeric title={`${locale === "es" ? "Periodo finalizado" : "Period ending"} ${c.sublabel}`}>
              <span className="block">{c.label}</span>
              <span className="block font-normal normal-case text-fg-muted/70">{c.sublabel}</span>
            </Th>
          ))}
        </tr>
      </THead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.lineItem}>
            <Td className="text-fg-secondary">
              {lineItemLabel(locale, row.lineItem, row.label)}
              {row.unit === "per_share" && <span className="ml-1 text-[10px] text-fg-muted">USD</span>}
            </Td>
            {row.cells.map((cell, i) => (
              <Td key={columns[i]?.end ?? i} numeric>
                <StatementCellView cell={cell} unit={row.unit} locale={locale} />
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
