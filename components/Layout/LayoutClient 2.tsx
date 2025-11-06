'use client';

import { usePathname } from 'next/navigation';
import { lazy, Suspense } from 'react';

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // 로그인 페이지는 레이아웃 없이 표시
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // 다른 페이지는 Layout을 동적으로 import
  const Layout = lazy(() => import('./Layout'));
  
  return (
    <Suspense fallback={<div style={{ display: 'flex', minHeight: '100vh' }}>{children}</div>}>
      <Layout>{children}</Layout>
    </Suspense>
  );
}

