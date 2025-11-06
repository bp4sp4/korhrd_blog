import Sidebar from '../Sidebar/Sidebar';
import Header from '../Header/Header';
import LayoutClient from './LayoutClient';

interface LayoutProps {
  children: React.ReactNode;
  showLayout?: boolean;
}

export default function Layout({ children, showLayout = true }: LayoutProps) {
  if (!showLayout) {
    return <>{children}</>;
  }

  return (
    <LayoutClient sidebar={<Sidebar />} header={<Header />}>
      {children}
    </LayoutClient>
  );
}
