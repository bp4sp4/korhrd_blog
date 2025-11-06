'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext } from 'react';

// Layout 컨텍스트 생성
const LayoutContext = createContext<{ shouldShowLayout: boolean }>({
  shouldShowLayout: true,
});

export default function LayoutConditional({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const shouldShowLayout = pathname !== '/login';

  return (
    <LayoutContext.Provider value={{ shouldShowLayout }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayoutContext() {
  return useContext(LayoutContext);
}

