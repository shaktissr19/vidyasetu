'use client';

import { useParams } from 'next/navigation';
import ContentPackReview from '@/components/admin/ContentPackReview';

export default function ContentPackReviewPage() {
  const params = useParams<{ packKey: string }>();
  return <ContentPackReview packKey={params.packKey} />;
}