import { Button } from '@/components/ui/button';

type TopbarProps = {
  email: string;
  fullName: string | null;
  organizationName: string | null;
};

export function Topbar({ email, fullName, organizationName }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <span className="text-sm font-medium">{organizationName}</span>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{fullName ?? email}</span>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" className="h-8 px-3">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
