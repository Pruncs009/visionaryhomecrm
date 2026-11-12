'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <button onClick={reset} className="underline">Try again</button>
      </body>
    </html>
  );
}
