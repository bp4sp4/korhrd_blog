'use client';

import { useState } from 'react';
import styles from './bulk.module.css';

interface KeywordResult {
  keyword: string;
  autocompletion: string | null;
  pcViews: number | null;
  mobileViews: number | null;
  monthlySearchVolume: number | null;
  monthlyPublicationCount: number | null;
  error?: string;
}

export default function BulkKeywordPage() {
  const [keywords, setKeywords] = useState('');
  const [results, setResults] = useState<KeywordResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleKeywordChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setKeywords(e.target.value);
  };

  const handleSearch = async () => {
    if (!keywords.trim()) {
      alert('키워드를 입력해주세요.');
      return;
    }

    // 키워드를 줄바꿈 또는 쉼표로 분리
    const keywordList = keywords
      .split(/[\n,]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keywordList.length === 0) {
      alert('유효한 키워드를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setResults([]);

    try {
      const response = await fetch('/api/keyword/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keywords: keywordList }),
      });

      if (!response.ok) {
        throw new Error('키워드 데이터를 가져오는데 실패했습니다.');
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('키워드 검색 중 오류 발생:', error);
      alert('키워드 검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>키워드 대량조회</h1>
        <p className={styles.subtitle}>
          여러 키워드를 한 번에 조회하여 조회수, 검색량, 발행수를 확인하세요
        </p>
      </div>

      <div className={styles.searchSection}>
        <div className={styles.inputWrapper}>
          <label className={styles.label}>키워드 입력 (줄바꿈 또는 쉼표로 구분)</label>
          <div className={styles.textareaWrapper}>
            <textarea
              className={styles.textarea}
              value={keywords}
              onChange={handleKeywordChange}
              placeholder="키워드를 입력하세요 (예: 사회복지사&#10;자격증&#10;취득방법)"
              rows={8}
            />
          </div>
          <div className={styles.inputFooter}>
            <button
              className={styles.searchButton}
              onClick={handleSearch}
              disabled={isLoading || !keywords.trim()}
            >
              {isLoading ? '조회 중...' : '대량 조회'}
            </button>
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div className={styles.resultsSection}>
          <h2 className={styles.resultsTitle}>조회 결과 ({results.length}개)</h2>
          <div className={styles.resultsTable}>
            <table>
              <thead>
                <tr>
                  <th>키워드</th>
                  <th>PC 조회수</th>
                  <th>모바일 조회수</th>
                  <th>월 검색량</th>
                  <th>월 발행수</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr key={index} className={result.error ? styles.errorRow : ''}>
                    <td className={styles.keywordCell}>
                      <strong>{result.keyword}</strong>
                      {result.error && (
                        <span className={styles.errorBadge}>오류</span>
                      )}
                    </td>
                    <td>
                      {result.pcViews !== null
                        ? result.pcViews.toLocaleString()
                        : '-'}
                    </td>
                    <td>
                      {result.mobileViews !== null
                        ? result.mobileViews.toLocaleString()
                        : '-'}
                    </td>
                    <td>
                      {result.monthlySearchVolume !== null
                        ? result.monthlySearchVolume.toLocaleString()
                        : '-'}
                    </td>
                    <td>
                      {result.monthlyPublicationCount !== null
                        ? result.monthlyPublicationCount.toLocaleString()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>키워드 데이터를 조회하는 중...</p>
        </div>
      )}
    </div>
  );
}

