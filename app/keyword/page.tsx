'use client';

import { useState } from 'react';
import styles from './keyword.module.css';

interface SearchResult {
  rank: number;
  title: string;
  id: string;
  nickname: string;
  index: string;
  reliability: string;
  publicationDate: string;
  charCount: number;
  coreKeyword: string;
  subKeyword: string;
  imageCount: number;
  visitorCount: string;
  diagnosis: string;
  link?: string;
}

interface Tab {
  title: string;
  active: boolean;
}

interface SearchData {
  summary: {
    monthlyPublicationCount?: string;
    keywordTopic?: string;
    keywordType?: string;
    autocompletion?: string;
    averageCharCount?: string;
    averageCoreKeywords?: string;
    averagePublicationDate?: string;
    indexRatio?: { red: number; blue: number };
  };
  tabs: Tab[];
  results: { [key: string]: SearchResult[] };
}

export default function KeywordPage() {
  const [keyword, setKeyword] = useState('');
  const [count, setCount] = useState(30);
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('블로그');
  const [selectedTab, setSelectedTab] = useState('blog');

  const handleSearch = async () => {
    if (!keyword.trim()) {
      alert('키워드를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/keyword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword: keyword.trim(), count, tab: selectedTab }),
      });

      if (!response.ok) {
        throw new Error('키워드 데이터를 가져오는데 실패했습니다.');
      }

      const data = await response.json();
      setSearchData(data);
      if (data.tabs && data.tabs.length > 0) {
        const firstActiveTab = data.tabs.find((t: Tab) => t.active) || data.tabs[0];
        setActiveTab(firstActiveTab.title);
      }
    } catch (error) {
      console.error('키워드 검색 중 오류 발생:', error);
      alert('키워드 검색 중 오류가 발생했습니다.');
      setSearchData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const currentResults = activeTab && searchData ? searchData.results[activeTab] || [] : [];

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>키워드 조회</h2>

      <div className={styles.searchSection}>
        <div className={styles.searchBox}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>키워드</label>
            <input
              type="text"
              className={styles.searchInput}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="키워드를 입력하세요"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>개수</label>
            <select
              className={styles.countSelect}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <button
            className={styles.searchButton}
            onClick={handleSearch}
            disabled={isLoading}
          >
            {isLoading ? '검색 중...' : '검색'}
          </button>
        </div>
      </div>

      {searchData && (
        <>
          {/* 요약 정보 */}
          <div className={styles.summarySection}>
            <h3 className={styles.sectionTitle}>요약 정보</h3>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>총 검색 결과 수</span>
                <span className={styles.summaryValue}>{searchData.summary.monthlyPublicationCount || '-'}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>키워드 주제</span>
                <span className={styles.summaryValue}>{searchData.summary.keywordTopic || '-'}</span>
              </div>
            </div>
          </div>

          {/* 통합검색 탭 */}
          {searchData.tabs && searchData.tabs.length > 0 && (
            <div className={styles.tabsSection}>
              <div className={styles.tabs}>
                {searchData.tabs.map((tab) => {
                  const tabKey = tab.title === '블로그' ? 'blog' :
                                 tab.title === '뉴스' ? 'news' :
                                 tab.title === '카페글' ? 'cafearticle' : 'webkr';
                  return (
                    <button
                      key={tab.title}
                      className={`${styles.tab} ${activeTab === tab.title ? styles.activeTab : ''}`}
                      onClick={() => {
                        setActiveTab(tab.title);
                        setSelectedTab(tabKey);
                      }}
                    >
                      {tab.title}
                    </button>
                  );
                })}
              </div>
              <p className={styles.tabNote}>
                * 네이버 검색 API를 사용합니다. 하루 호출 한도는 25,000회입니다.
              </p>
            </div>
          )}

          {/* 결과 테이블 */}
          {activeTab && currentResults.length > 0 && (
            <div className={styles.resultsSection}>
              <table className={styles.resultsTable}>
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>제목</th>
                    <th>아이디</th>
                    <th>닉네임</th>
                    <th>발행일</th>
                    <th>핵심키</th>
                  </tr>
                </thead>
                <tbody>
                  {currentResults.map((result, index) => (
                    <tr key={index}>
                      <td>{result.rank}</td>
                      <td className={styles.titleCell}>
                        {result.link ? (
                          <a href={result.link} target="_blank" rel="noopener noreferrer" className={styles.titleLink}>
                            {result.title}
                          </a>
                        ) : (
                          result.title
                        )}
                      </td>
                      <td>{result.id}</td>
                      <td>{result.nickname}</td>
                      <td>{result.publicationDate}</td>
                      <td>{result.coreKeyword}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab && currentResults.length === 0 && (
            <div className={styles.emptyState}>
              <p>검색 결과가 없습니다.</p>
            </div>
          )}
        </>
      )}

      {isLoading && (
        <div className={styles.loadingState}>
          <p>데이터를 가져오는 중...</p>
        </div>
      )}
    </div>
  );
}

