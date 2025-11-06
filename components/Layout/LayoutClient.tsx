'use client';

import styles from './Layout.module.css';

export default function LayoutClient({
  children,
  sidebar,
  header,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <>
      {sidebar}
      {header}
      <div className={styles.container}>
        <main className={styles.mainContent}>
          {children}
        </main>
      </div>
    </>
  );
}

