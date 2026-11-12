import Link from 'next/link';
import { Button } from '@/components/ui/button';

type PaginationProps = {
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  noun: [singular: string, plural: string];
  /** Current filters; preserved in the prev/next links. */
  params: Record<string, string | number | undefined>;
};

/** Prev / next pagination driven by ?page=, keeping the other query params. */
export function Pagination({ basePath, page, pageCount, total, noun, params }: PaginationProps) {
  if (pageCount <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && k !== 'page') sp.set(k, String(v));
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Page {page} of {pageCount} · {total} {total === 1 ? noun[0] : noun[1]}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" render={<Link href={href(page - 1)} />} nativeButton={false}>Previous</Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Previous</Button>
        )}
        {page < pageCount ? (
          <Button variant="outline" size="sm" render={<Link href={href(page + 1)} />} nativeButton={false}>Next</Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Next</Button>
        )}
      </div>
    </nav>
  );
}
