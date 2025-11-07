'use client';

import { useState } from 'react';
import styles from './smartblock.module.css';

interface SmartBlockItem {
  title: string;
  icon?: string;
  description?: string;
  category?: string;
  tag?: string;
  tagType?: 'personal' | 'popular';
}

interface SmartBlockGroup {
  id: string;
  title: string;
  icon: string;
  type: string;
  data: SmartBlockItem[];
}

export default function SmartBlockPage() {
  const [titleQuery, setTitleQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [smartBlockGroups, setSmartBlockGroups] = useState<SmartBlockGroup[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // 제목 검색 (네이버에서 제목 존재 여부 확인)
  const handleTitleSearch = () => {
    if (!titleQuery.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    const encodedQuery = encodeURIComponent(titleQuery.trim());
    const naverSearchUrl = `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=${encodedQuery}`;
    window.open(naverSearchUrl, '_blank');
  };

  // 스마트블록 검색 (클라이언트 사이드 처리)
  const handleSmartBlockSearch = () => {
    if (!searchQuery.trim()) {
      alert('검색어를 입력해주세요.');
      return;
    }

    // 네이버 검색 페이지로 직접 이동 (새 탭)
    const encodedQuery = encodeURIComponent(searchQuery.trim());
    const naverSearchUrl = `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=${encodedQuery}`;
    
    // 새 탭에서 네이버 검색 결과 열기
    window.open(naverSearchUrl, '_blank');
    
    // 사용자에게 안내 메시지 표시
    alert('네이버 검색 결과 페이지가 새 탭에서 열렸습니다.\n검색 결과 페이지에서 "함께 많이 찾는" 스마트블록을 직접 확인하세요.');
    
    // 스마트블록 데이터는 클라이언트에서 직접 가져올 수 없으므로 빈 배열로 설정
    // 대신 사용자가 직접 확인할 수 있도록 안내
    setSmartBlockGroups([]);
  };

  const handleItemClick = (keyword: string) => {
    const encodedQuery = encodeURIComponent(keyword);
    const naverSearchUrl = `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=${encodedQuery}`;
    window.open(naverSearchUrl, '_blank');
  };

  // 모든 스마트블록 아이템을 평탄화
  const allItems: SmartBlockItem[] = smartBlockGroups.flatMap(group => group.data);
  const totalPages = Math.ceil(allItems.length / itemsPerPage);
  const paginatedItems = allItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>스마트블록 & 검색</h2>

      {/* 제목 검색 섹션 */}
      <div className={styles.searchSection}>
        <h3 className={styles.sectionTitle}>제목 검색</h3>
        <div className={styles.searchBox}>
          <input
            type="text"
            className={styles.searchInput}
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
            placeholder="제목을 입력하세요"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleTitleSearch();
              }
            }}
          />
          <button
            className={styles.searchButton}
            onClick={handleTitleSearch}
          >
            검색
          </button>
        </div>
        <p className={styles.description}>
          제목을 입력하고 검색 버튼을 클릭하면 네이버에서 해당 제목이 있는지 확인할 수 있습니다.
        </p>
      </div>

      {/* 스마트블록 검색 섹션 */}
      <div className={styles.searchSection}>
        <h3 className={styles.sectionTitle}>스마트블록 검색</h3>
        <div className={styles.searchBox}>
          <input
            type="text"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색어를 입력하세요"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSmartBlockSearch();
              }
            }}
          />
          <button
            className={styles.searchButton}
            onClick={handleSmartBlockSearch}
          >
            네이버에서 검색하기
          </button>
        </div>
        <p className={styles.description}>
          검색어를 입력하고 버튼을 클릭하면 네이버 검색 결과 페이지가 새 탭에서 열립니다. 
          검색 결과 페이지에서 "함께 많이 찾는" 스마트블록을 직접 확인할 수 있습니다.
        </p>
      </div>

      {/* 스마트블록 결과 섹션 */}
      {smartBlockGroups.length > 0 && (
        <div className={styles.smartBlockSection}>
          <div className={styles.smartBlockHeader}>
            <h3 className={styles.smartBlockTitle}>
              <span className={styles.infoIcon}>ℹ️</span>
              함께 많이 찾는
            </h3>
            <span className={styles.totalCount}>
              총 {allItems.length}개
            </span>
          </div>

          {allItems.length === 0 ? (
            <div className={styles.emptyState}>
              <p>관련 검색어가 없습니다.</p>
            </div>
          ) : (
            <>
              <div className={styles.smartBlockGrid}>
                {paginatedItems.map((item, index) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + index;
                  return (
                    <div
                      key={globalIndex}
                      className={styles.smartBlockItem}
                      onClick={() => handleItemClick(item.title)}
                    >
                      <div className={styles.itemContent}>
                        <span className={styles.keyword}>{item.title}</span>
                        {item.tag && (
                          <span className={`${styles.tag} ${item.tagType === 'personal' ? styles.tagPersonal : item.tagType === 'popular' ? styles.tagPopular : ''}`}>
                            {item.tag}
                          </span>
                        )}
                        {item.icon && (
                          <span className={styles.itemIcon}>{item.icon}</span>
                        )}
                      </div>
                      <div className={styles.searchIcon}>🔍</div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    className={styles.paginationButton}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    &lt;
                  </button>
                  <span className={styles.paginationInfo}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    className={styles.paginationButton}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    &gt;
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}

