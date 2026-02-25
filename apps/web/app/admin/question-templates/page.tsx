// Redirect to merged insights page
// Customer Insights content is now at /admin/insights (customer tab)

import { redirect } from 'next/navigation';

export default function QuestionTemplatesPage() {
  redirect('/admin/insights');
}
