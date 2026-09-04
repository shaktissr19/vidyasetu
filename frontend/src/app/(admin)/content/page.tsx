import { redirect } from 'next/navigation';

export default function LegacyAcademicContentRedirect() {
  redirect('/admin/learning');
}
