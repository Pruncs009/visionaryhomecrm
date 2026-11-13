import { UserMenu } from './user-menu';

type TopbarProps = {
  email: string;
  fullName: string | null;
  organizationName: string | null;
  /** Saved page background (Settings → Change theme). */
  background: string;
};

export function Topbar({ email, fullName, organizationName, background }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-brand-teal px-6">
      <span className="text-sm font-medium">{organizationName}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{fullName ?? email}</span>
        <UserMenu initialBg={background} />
      </div>
    </header>
  );
}
