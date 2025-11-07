'use client';

import { useState } from 'react';
import styles from './smartblock.module.css';

interface SmartBlockItem {
  title: string;
  content?: string;
  link?: string;
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
  const [hasSearched, setHasSearched] = useState(false);

  // 제목 검색 (네이버에서 제목 존재 여부 확인)
  const handleTitleSearch = () => {
    if (!titleQuery.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    // 따옴표로 제목을 감싸서 정확한 검색
    const queryWithQuotes = `"${titleQuery.trim()}"`;
    const encodedQuery = encodeURIComponent(queryWithQuotes);
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
    setHasSearched(false);
    
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
      setHasSearched(true);
    } catch (error: any) {
      console.error('스마트블록 검색 중 오류 발생:', error);
      const errorMessage = error?.message || '스마트블록 검색 중 오류가 발생했습니다.';
      alert(errorMessage);
      setSmartBlockGroups([]);
      setHasSearched(true);
    } finally {
      setIsLoading(false);
    }
  };


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
          검색어를 입력하고 버튼을 클릭하면 네이버 검색 결과에서 스마트블록(함께 많이 찾는) 데이터를 가져옵니다.
        </p>
      </div>

      {/* 스마트블록 결과 섹션 */}
      {hasSearched && !isLoading && (
        <>
          {smartBlockGroups.length > 0 ? (
            <div className={styles.smartBlockSection}>
              {smartBlockGroups.map((group) => (
                <div key={group.id} className={styles.smartBlockTableContainer}>
                  <div className={styles.smartBlockHeader}>
                    <h3 className={styles.smartBlockTitle}>
                      {group.title}
                    </h3>
                    <span className={styles.totalCount}>
                      총 {group.data.length}개
                    </span>
                  </div>

                  {group.data.length === 0 ? (
                    <div className={styles.emptyState}>
                      <p>블로그 항목이 없습니다.</p>
                    </div>
                  ) : (
                    <div className={styles.tableWrapper}>
                      <table className={styles.smartBlockTable}>
                        <thead>
                          <tr>
                            <th className={styles.tableHeader}>제목</th>
                            <th className={styles.tableHeader}>내용</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.data.map((item, index) => (
                            <tr key={index}>
                              <td className={styles.tableCell}>
                                {item.link ? (
                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.tableLink}
                                  >
                                    {item.title}
                                  </a>
                                ) : (
                                  <span>{item.title}</span>
                                )}
                              </td>
                              <td className={styles.tableCell}>
                                <span className={styles.tableContent}>
                                  {item.content || '-'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.smartBlockSection}>
              <div className={styles.emptyState}>
                <p>연관된 스마트블록이 없습니다.</p>
              </div>
            </div>
          )}
        </>
      )}

      {isLoading && (
        <div className={styles.loadingState}>
          <p>스마트블록 데이터를 가져오는 중...</p>
        </div>
      )}
    </div>
  );
}

