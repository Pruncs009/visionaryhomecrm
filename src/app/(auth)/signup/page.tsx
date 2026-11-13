import { redirect } from 'next/navigation';

// Self sign-up is turned off: accounts are created by an admin.
export default function SignupPage() {
  redirect('/login');
}
