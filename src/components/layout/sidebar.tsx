import Link from 'next/link';
import { mainNav } from '@/config/navigation';

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r p-4 md:block">
      <div className="mb-6 font-semibold">VisionaryHomeCRM</div>
      <nav className="space-y-1">
        {mainNav.map((item) => (
          <Link key={item.href} href={item.href} className="block rounded px-3 py-2 text-sm hover:bg-muted">
            {item.title}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
