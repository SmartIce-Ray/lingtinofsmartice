// Redirect to merged insights page
// Product Insights content is now at /admin/insights (product tab)

import { redirect } from 'next/navigation';

export default function StaffQuestionsPage() {
  redirect('/admin/insights');
}
