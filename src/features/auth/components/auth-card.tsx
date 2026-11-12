import Image from 'next/image';

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <Image src="/logo.png" alt="Visionary Home Offer" width={319} height={180} priority className="mx-auto mb-6 h-auto w-56" />
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-xl border bg-background p-6 shadow-sm">{children}</div>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
