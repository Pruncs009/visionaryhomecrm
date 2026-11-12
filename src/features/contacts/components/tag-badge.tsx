import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

/** A tag chip; links to the contact list filtered by that tag. */
export function TagBadge({ tag }: { tag: string }) {
  return (
    <Badge variant="outline" render={<Link href={`/contacts?tag=${encodeURIComponent(tag)}`} />} className="font-normal">
      {tag}
    </Badge>
  );
}
