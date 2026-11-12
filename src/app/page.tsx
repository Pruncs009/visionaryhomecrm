import { redirect } from 'next/navigation';

// Root: send users to the dashboard (middleware redirects to /login if signed out).
export default function Home() {
  redirect('/dashboard');
}
