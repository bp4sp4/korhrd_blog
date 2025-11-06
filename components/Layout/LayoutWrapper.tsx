'use client';

import { useLayoutContext } from './LayoutConditional';

export default function LayoutWrapper({
  children,
  layoutComponent,
}: {
  children: React.ReactNode;
  layoutComponent: React.ReactNode;
}) {
  const { shouldShowLayout } = useLayoutContext();

  if (!shouldShowLayout) {
    return <>{children}</>;
  }

  return <>{layoutComponent}</>;
}

