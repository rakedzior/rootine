import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  itemLabel = "strona",
  className = "",
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const safePage = Math.min(Math.max(page, 1), pageCount);

  return (
    <nav
      className={["ui-pagination", className].filter(Boolean).join(" ")}
      aria-label="Paginacja"
    >
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={<ChevronLeft size={15} aria-hidden="true" />}
        disabled={safePage === 1}
        onClick={() => onPageChange(safePage - 1)}
      >
        Poprzednia
      </Button>
      <span className="ui-pagination__status" aria-live="polite">
        {itemLabel} <strong>{safePage}</strong> z {pageCount}
      </span>
      <Button
        variant="ghost"
        size="sm"
        trailingIcon={<ChevronRight size={15} aria-hidden="true" />}
        disabled={safePage === pageCount}
        onClick={() => onPageChange(safePage + 1)}
      >
        Następna
      </Button>
    </nav>
  );
}
