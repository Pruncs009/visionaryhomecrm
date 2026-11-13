import { redirect } from 'next/navigation';

// Users are added and managed on /team (Manage Users).
export default function Page() {
  redirect('/team');
}
