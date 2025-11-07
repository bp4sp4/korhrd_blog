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

  const [isLoading, setIsLoading] = useState(false);

  // 스마트블록 검색 (HTML 파싱 방식)
  const handleSmartBlockSearch = async () => {
    if (!searchQuery.trim()) {
      alert('검색어를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setCurrentPage(1);
    
    try {
      const response = await fetch('/api/smartblock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword: searchQuery.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || '스마트블록 데이터를 가져오는데 실패했습니다.');
      }

      const data = await response.json();
      setSmartBlockGroups(data.smartBlocks || []);
      
      if (data.smartBlocks.length === 0) {
        alert('스마트블록을 찾을 수 없습니다. HTML 파싱이 실패했을 수 있습니다.');
      }
    } catch (error: any) {
      console.error('스마트블록 검색 중 오류 발생:', error);
      const errorMessage = error?.message || '스마트블록 검색 중 오류가 발생했습니다.';
      alert(errorMessage);
      setSmartBlockGroups([]);
    } finally {
      setIsLoading(false);
    }
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
            disabled={isLoading}
          >
            {isLoading ? '검색 중...' : '스마트블록 가져오기'}
          </button>
        </div>
        <p className={styles.description}>
          검색어를 입력하고 버튼을 클릭하면 네이버 검색 결과에서 스마트블록(함께 많이 찾는) 데이터를 HTML 파싱으로 가져옵니다.
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

      {isLoading && (
        <div className={styles.loadingState}>
          <p>스마트블록 데이터를 가져오는 중...</p>
        </div>
      )}
    </div>
  );
}

