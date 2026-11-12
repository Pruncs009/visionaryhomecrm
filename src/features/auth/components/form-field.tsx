import { Input } from '@/components/ui/input';

type FormFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  errors?: string[];
};

/** Label + input + inline error, wired up for screen readers. */
export function FormField({ name, label, errors, ...inputProps }: FormFieldProps) {
  const errorId = `${name}-error`;
  const firstError = errors?.[0];
  const hasError = !!firstError;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={name}
        name={name}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        {...inputProps}
      />
      {hasError && (
        <p id={errorId} className="text-sm text-destructive">
          {firstError}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
        {success}
      </p>
    );
  }
  return null;
}
