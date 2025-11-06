'use client';

import { useRouter, usePathname } from 'next/navigation';
import { FileText, Shield, Search } from 'lucide-react';
import styles from './Sidebar.module.css';

interface SidebarClientProps {
  isAdmin: boolean;
}

export default function SidebarClient({ isAdmin }: SidebarClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleNavClick = (path: string) => {
    router.push(path);
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.img}><img src="/logo.png" alt="logo" /></span>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navSection}>
          <a
            href="/"
            className={`${styles.navItem} ${pathname === '/' ? styles.active : ''}`}
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('/');
            }}
          >
            <FileText size={20} className={styles.navIcon} />
            <span className={styles.navText}>블로그 기록</span>
          </a>
        </div>

        <div className={styles.navSection}>
          <a
            href="/morpheme"
            className={`${styles.navItem} ${pathname === '/morpheme' ? styles.active : ''}`}
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('/morpheme');
            }}
          >
            <Search size={20} className={styles.navIcon} />
            <span className={styles.navText}>형태소 진단</span>
          </a>
        </div>

        {isAdmin && (
          <div className={styles.navSection}>
            <a
              href="/admin"
              className={`${styles.navItem} ${pathname === '/admin' ? styles.active : ''}`}
              onClick={(e) => {
                e.preventDefault();
                handleNavClick('/admin');
              }}
            >
              <Shield size={20} className={styles.navIcon} />
              <span className={styles.navText}>관리자</span>
            </a>
          </div>
        )}
      </nav>
    </aside>
  );
}

