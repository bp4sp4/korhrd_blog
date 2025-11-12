'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './KeywordMenu.module.css';

type KeywordRecord = {
  id: string;
  keyword: string;
  blog_id: string | null;
  memo?: string | null;
  category?: string | null;
  created_at: string;
  blog?: {
    id: string;
    keyword: string | null;
    title: string | null;
    ranking: number | null;
    link: string | null;
    author: string | null;
    search_volume: number | null;
    created_at?: string | null;
  } | null;
};

type FetchState = 'idle' | 'loading' | 'error';

type Category = '사회복지사' | '산업기사/기사자격증' | '학점은행제' | '보육교사' | '심리/상담' | '평생교육원' | '대학교 편입' | '복지분야 민간자격증' | '아동분야 민간자격증';

const CATEGORIES: Category[] = ['사회복지사', '산업기사/기사자격증', '학점은행제', '보육교사', '심리/상담', '평생교육원', '대학교 편입', '복지분야 민간자격증', '아동분야 민간자격증'];

const medalAssets: Record<number, string> = {
  1: '/goldmedal.png',
  2: '/silvermedal.png',
  3: '/bronzemedal.png',
};

export default function KeywordMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [blogIdInput, setBlogIdInput] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [activeTab, setActiveTab] = useState<Category>('사회복지사');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingBlogId, setIsFetchingBlogId] = useState(false);
  const [searchVolumes, setSearchVolumes] = useState<Record<string, number | null>>({});
  const [fetchingSearchVolumes, setFetchingSearchVolumes] = useState<Set<string>>(new Set());
  const isInitialLoad = useRef(true);
  const fetchBlogIdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetMessages = () => {
    setError('');
    setSuccessMessage('');
  };

  const loadKeywords = useCallback(async () => {
    resetMessages();
    setFetchState('loading');
    try {
      const response = await fetch('/api/keywords', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData?.error ?? `키워드 목록을 불러오지 못했습니다. (${response.status})`;
        throw new Error(errorMessage);
      }

      const json = await response.json();
      setKeywords(Array.isArray(json.keywords) ? json.keywords : []);
      setFetchState('idle');
    } catch (err: any) {
      console.error('[keyword-menu] load failed', err);
      setError(err?.message ?? '키워드 목록을 불러오지 못했습니다.');
      setFetchState('error');
    }
  }, []);

  // 메달 순위가 있는 키워드들의 블로그 ID 자동 업데이트 (조용히 백그라운드에서 실행)
  const handleAutoUpdateBlogIdsSilent = useCallback(async () => {
    // 메달 순위가 있고(1-3위), 블로그 ID가 없지만, 매칭된 블로그가 있는 키워드들 찾기
    const keywordsToUpdate = keywords.filter((item) => {
      const ranking = item.blog?.ranking ?? null;
      const hasBlogId = !!(item.blog_id && item.blog_id.trim().length > 0);
      const hasMatchedBlog = !!(item.blog?.id);
      
      return (
        ranking && ranking >= 1 && ranking <= 3 && // 메달 순위가 있음
        !hasBlogId && // 블로그 ID가 없음
        hasMatchedBlog // 매칭된 블로그가 있음
      );
    });

    if (keywordsToUpdate.length === 0) {
      return;
    }

    try {
      // 각 키워드를 업데이트하기 위해 POST API 사용
      const updatePromises = keywordsToUpdate.map((item) =>
        fetch('/api/keywords', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            keyword: item.keyword,
            blogId: item.blog?.id || null,
            memo: item.memo || undefined,
            category: item.category || undefined,
          }),
        })
      );

      const responses = await Promise.all(updatePromises);
      const results = await Promise.all(responses.map((r) => r.json()));

      const failed = results.filter((r) => !r.keywords || r.error);
      if (failed.length > 0) {
        console.warn(`[keyword-menu] ${failed.length}개의 키워드 업데이트에 실패했습니다.`);
      }

      // 업데이트가 성공했으면 키워드 목록 새로고침 (조용히)
      if (failed.length < keywordsToUpdate.length) {
        await loadKeywords();
      }
    } catch (err: any) {
      console.warn('[keyword-menu] auto update blog IDs failed (silent)', err);
    }
  }, [keywords, loadKeywords]);

  useEffect(() => {
    void loadKeywords();
  }, [loadKeywords]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(''), 2500);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  // 키워드 목록이 로드된 후 메달 순위가 있는 키워드들의 블로그 ID 자동 업데이트
  useEffect(() => {
    if (keywords.length === 0 || fetchState === 'loading') return;

    // 500ms 후에 자동 업데이트 실행 (백그라운드)
    const timer = setTimeout(() => {
      void handleAutoUpdateBlogIdsSilent();
    }, 500);

    return () => clearTimeout(timer);
  }, [keywords, fetchState, handleAutoUpdateBlogIdsSilent]);

  // 검색량이 없는 키워드들의 검색량 자동 가져오기 (DB 저장 없이 클라이언트 상태만 사용)
  const fetchSearchVolumesForKeywords = useCallback(async (keywordsToFetch: KeywordRecord[], forceRefresh = false) => {
    // forceRefresh가 false인 경우: 이미 가져온 키워드나 가져오는 중인 키워드는 제외
    // forceRefresh가 true인 경우: 가져오는 중인 키워드만 제외 (모든 키워드 새로고침)
    // DB에 저장하지 않으므로 클라이언트 상태만 확인
    const keywordsNeedingVolume = keywordsToFetch.filter((item) => {
      const isFetching = fetchingSearchVolumes.has(item.keyword);
      if (forceRefresh) {
        return !isFetching; // 새로고침 모드: 가져오는 중인 것만 제외
      }
      // 클라이언트 상태에 이미 있으면 제외 (한번 가져온 값 유지)
      const isAlreadyFetched = searchVolumes[item.keyword] !== undefined;
      return !isAlreadyFetched && !isFetching;
    });

    if (keywordsNeedingVolume.length === 0) {
      return;
    }

    // 한 번에 최대 8개씩 병렬 처리 (빠르고 확실하게)
    const batchSize = 8;
    const batches: KeywordRecord[][] = [];
    for (let i = 0; i < keywordsNeedingVolume.length; i += batchSize) {
      batches.push(keywordsNeedingVolume.slice(i, i + batchSize));
    }

    // 각 배치를 병렬 처리하여 빠르게 가져오기
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      // 배치 내에서 병렬 처리 (재시도 로직 포함)
      const promises = batch.map(async (item, retryCount = 0) => {
        const maxRetries = 2;
        setFetchingSearchVolumes((prev) => new Set(prev).add(item.keyword));
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const response = await fetch('/api/keywords/test-search-volume', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ keyword: item.keyword }),
            });

            if (response.ok) {
              const data = await response.json();
              const searchVolume = data.search_volume?.actual_search_count ?? 
                                  data.search_volume?.total_combined_ratio ?? 
                                  null;
              setSearchVolumes((prev) => ({
                ...prev,
                [item.keyword]: searchVolume,
              }));
              return; // 성공하면 종료
            } else if (attempt < maxRetries) {
              // 실패 시 재시도 (짧은 딜레이 후)
              await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
              continue;
            } else {
              // 최종 실패
              setSearchVolumes((prev) => ({
                ...prev,
                [item.keyword]: null,
              }));
            }
          } catch (err) {
            if (attempt < maxRetries) {
              // 에러 시 재시도
              await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
              continue;
            } else {
              console.warn(`[keyword-menu] Failed to fetch search volume for ${item.keyword} after ${maxRetries + 1} attempts`, err);
              setSearchVolumes((prev) => ({
                ...prev,
                [item.keyword]: null,
              }));
            }
          }
        }
      });

      await Promise.all(promises);

      // 배치 간 짧은 딜레이 (API 호출 제한 방지)
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      
      // 모든 요청 완료 후 fetching 상태 정리
      batch.forEach((item) => {
        setFetchingSearchVolumes((prev) => {
          const next = new Set(prev);
          next.delete(item.keyword);
          return next;
        });
      });
    }
  }, [searchVolumes, fetchingSearchVolumes]);

  // 키워드 목록이 로드된 후 검색량이 없는 키워드들의 검색량 자동 가져오기 (즉시 실행)
  useEffect(() => {
    if (keywords.length === 0 || fetchState === 'loading') return;

    // 즉시 검색량 가져오기 실행
    const activeTabKeywords = keywords.filter((item) => {
      const itemCategory = (item.category as Category) || '사회복지사';
      return itemCategory === activeTab;
    });

    const keywordsWithoutVolume = activeTabKeywords.filter((item) => {
      const hasSearchVolume = item.blog?.search_volume !== null && item.blog?.search_volume !== undefined;
      const isAlreadyFetched = searchVolumes[item.keyword] !== undefined;
      return !hasSearchVolume && !isAlreadyFetched;
    });

    if (keywordsWithoutVolume.length > 0) {
      void fetchSearchVolumesForKeywords(keywordsWithoutVolume);
    }
  }, [keywords, fetchState, activeTab, searchVolumes, fetchSearchVolumesForKeywords]);

  // 1시간마다 모든 키워드의 검색량 자동 새로고침
  useEffect(() => {
    if (keywords.length === 0 || fetchState === 'loading') return;

    // 1시간 = 3600000ms
    const interval = setInterval(() => {
      // 활성 탭에 해당하는 모든 키워드의 검색량 새로고침
      const activeTabKeywords = keywords.filter((item) => {
        const itemCategory = (item.category as Category) || '사회복지사';
        return itemCategory === activeTab;
      });

      if (activeTabKeywords.length > 0) {
        console.log(`[keyword-menu] 1시간마다 검색량 새로고침 시작: ${activeTabKeywords.length}개 키워드`);
        void fetchSearchVolumesForKeywords(activeTabKeywords, true); // forceRefresh = true
      }
    }, 3600000); // 1시간

    return () => clearInterval(interval);
  }, [keywords, fetchState, activeTab, fetchSearchVolumesForKeywords]);

  // 키워드 입력 시 블로그 ID 자동 가져오기
  useEffect(() => {
    // 이전 타이머 취소
    if (fetchBlogIdTimeoutRef.current) {
      clearTimeout(fetchBlogIdTimeoutRef.current);
    }

    // 블로그 ID가 이미 입력되어 있으면 자동 가져오기 안 함
    if (blogIdInput.trim()) {
      return;
    }

    // 키워드가 비어있으면 실행 안 함
    if (!keywordInput.trim()) {
      return;
    }

    // 500ms 후에 API 호출 (debounce)
    fetchBlogIdTimeoutRef.current = setTimeout(async () => {
      setIsFetchingBlogId(true);
      try {
        const response = await fetch(
          `/api/keywords/find-blog-id?keyword=${encodeURIComponent(keywordInput.trim())}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const json = await response.json();
          if (json.blogId) {
            setBlogIdInput(json.blogId);
          }
        }
      } catch (err) {
        console.warn('[keyword-menu] Failed to fetch blog ID', err);
      } finally {
        setIsFetchingBlogId(false);
      }
    }, 500);

    return () => {
      if (fetchBlogIdTimeoutRef.current) {
        clearTimeout(fetchBlogIdTimeoutRef.current);
      }
    };
  }, [keywordInput, blogIdInput]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMessages();

    if (!keywordInput.trim()) {
      setError('키워드를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword: keywordInput.trim(),
          blogId: blogIdInput.trim() || null,
          memo: memoInput.trim() ? memoInput.trim() : undefined,
          category: activeTab,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error ?? '키워드를 저장하지 못했습니다.');
      }

      setSuccessMessage(`"${keywordInput.trim()}" 키워드를 등록했습니다.`);
      setKeywordInput('');
      setBlogIdInput('');
      setMemoInput('');

      const inserted = Array.isArray(json?.keywords) ? json.keywords : [];
      const targetBlogId =
        inserted[0]?.blog_id ??
        (typeof blogIdInput === 'string' && blogIdInput.trim().length > 0 ? blogIdInput.trim() : null);

      if (targetBlogId) {
        try {
          await fetch(`/api/rankings/fetch?id=${encodeURIComponent(targetBlogId)}`, { method: 'GET' });
        } catch (rankingError) {
          console.warn('[keyword-menu] ranking refresh failed', rankingError);
        }
      }

      await loadKeywords();
    } catch (err: any) {
      console.error('[keyword-menu] submit failed', err);
      setError(err?.message ?? '키워드를 저장하지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteKeyword = async (keywordId: string, keywordText: string) => {
    if (!window.confirm(`"${keywordText}" 키워드를 삭제하시겠습니까?`)) {
      return;
    }

    resetMessages();
    
    try {
      const response = await fetch(`/api/keywords?id=${encodeURIComponent(keywordId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error ?? '키워드를 삭제하지 못했습니다.');
      }

      setSuccessMessage(`"${keywordText}" 키워드를 삭제했습니다.`);
      await loadKeywords();
    } catch (err: any) {
      console.error('[keyword-menu] delete failed', err);
      setError(err?.message ?? '키워드를 삭제하지 못했습니다.');
    }
  };

  // 메달 순위가 있는 키워드들의 블로그 ID 자동 업데이트 (사용자 버튼 클릭 시)
  const handleAutoUpdateBlogIds = async () => {
    resetMessages();

    // 메달 순위가 있고(1-3위), 블로그 ID가 없지만, 매칭된 블로그가 있는 키워드들 찾기
    const keywordsToUpdate = keywords.filter((item) => {
      const ranking = item.blog?.ranking ?? null;
      const hasBlogId = !!(item.blog_id && item.blog_id.trim().length > 0);
      const hasMatchedBlog = !!(item.blog?.id);
      
      return (
        ranking && ranking >= 1 && ranking <= 3 && // 메달 순위가 있음
        !hasBlogId && // 블로그 ID가 없음
        hasMatchedBlog // 매칭된 블로그가 있음
      );
    });

    if (keywordsToUpdate.length === 0) {
      setSuccessMessage('업데이트할 키워드가 없습니다.');
      return;
    }

    if (!window.confirm(`${keywordsToUpdate.length}개의 키워드에 블로그 ID를 자동으로 업데이트하시겠습니까?`)) {
      return;
    }

    setIsSubmitting(true);

    try {
      // 각 키워드를 업데이트하기 위해 POST API 사용
      const updatePromises = keywordsToUpdate.map((item) =>
        fetch('/api/keywords', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            keyword: item.keyword,
            blogId: item.blog?.id || null,
            memo: item.memo || undefined,
            category: item.category || undefined,
          }),
        })
      );

      const responses = await Promise.all(updatePromises);
      const results = await Promise.all(responses.map((r) => r.json()));

      const failed = results.filter((r) => !r.keywords || r.error);
      if (failed.length > 0) {
        throw new Error(`${failed.length}개의 키워드 업데이트에 실패했습니다.`);
      }

      setSuccessMessage(`${keywordsToUpdate.length}개의 키워드에 블로그 ID를 업데이트했습니다.`);
      await loadKeywords();
    } catch (err: any) {
      console.error('[keyword-menu] auto update blog IDs failed', err);
      setError(err?.message ?? '블로그 ID 업데이트에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const keywordCountLabel = useMemo(() => {
    if (fetchState === 'loading') return '불러오는 중...';
    return `${keywords.length.toLocaleString()}개의 키워드`;
  }, [fetchState, keywords.length]);

  // 각 탭별 키워드 개수 계산
  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      '사회복지사': 0,
      '산업기사/기사자격증': 0,
      '학점은행제': 0,
      '보육교사': 0,
      '심리/상담': 0,
      '평생교육원': 0,
      '대학교 편입': 0,
      '복지분야 민간자격증': 0,
      '아동분야 민간자격증': 0,
    };
    
    keywords.forEach((item) => {
      const category = (item.category as Category) || '사회복지사';
      if (CATEGORIES.includes(category)) {
        counts[category]++;
      }
    });
    
    return counts;
  }, [keywords]);

  // 활성 탭에 해당하는 키워드 필터링 및 정렬 (메달 있는 것 먼저)
  const filteredKeywords = useMemo(() => {
    const filtered = keywords.filter((item) => {
      const itemCategory = (item.category as Category) || '사회복지사';
      return itemCategory === activeTab;
    });
    
    // 메달이 있는 키워드(ranking 1-3)를 먼저, 그 다음 나머지
    return filtered.sort((a, b) => {
      const aRanking = a.blog?.ranking ?? null;
      const bRanking = b.blog?.ranking ?? null;
      
      // 둘 다 메달이 있는 경우 (1-3위): ranking 순서대로
      if (aRanking && aRanking >= 1 && aRanking <= 3 && bRanking && bRanking >= 1 && bRanking <= 3) {
        return aRanking - bRanking;
      }
      
      // a만 메달이 있는 경우: a를 앞으로
      if (aRanking && aRanking >= 1 && aRanking <= 3) {
        return -1;
      }
      
      // b만 메달이 있는 경우: b를 앞으로
      if (bRanking && bRanking >= 1 && bRanking <= 3) {
        return 1;
      }
      
      // 둘 다 메달이 없는 경우: 등록일 최신순 (기존 순서 유지)
      return 0;
    });
  }, [keywords, activeTab]);

  // 업데이트 가능한 키워드 개수 계산
  const updatableKeywordsCount = useMemo(() => {
    return keywords.filter((item) => {
      const ranking = item.blog?.ranking ?? null;
      const hasBlogId = !!(item.blog_id && item.blog_id.trim().length > 0);
      const hasMatchedBlog = !!(item.blog?.id);
      
      return (
        ranking && ranking >= 1 && ranking <= 3 &&
        !hasBlogId &&
        hasMatchedBlog
      );
    }).length;
  }, [keywords]);

  // 사용 가능한 탭 (키워드가 있는 탭만)
  const availableTabs = useMemo(() => {
    return CATEGORIES.filter((category) => categoryCounts[category] > 0);
  }, [categoryCounts]);

  // 키워드가 로드되면 첫 번째 사용 가능한 탭으로 자동 전환 (초기 로드 시에만)
  useEffect(() => {
    if (isInitialLoad.current && keywords.length > 0 && availableTabs.length > 0) {
      if (!availableTabs.includes(activeTab)) {
        setActiveTab(availableTabs[0]);
      }
      isInitialLoad.current = false;
    }
  }, [keywords.length, availableTabs, activeTab]);

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>키워드 메뉴판</h1>
          <p className={styles.description}>
            상위노출 키워드를 등록하고 블로그 메달 상태를 한눈에 확인하세요. 현재 {keywordCountLabel}가
            관리되고 있습니다.
          </p>
        </div>
      </header>

      <div className={styles.actions}>
        
        {updatableKeywordsCount > 0 && (
          <button
            type="button"
            onClick={handleAutoUpdateBlogIds}
            disabled={isSubmitting}
            className={styles.autoUpdateButton}
          >
            {isSubmitting ? '업데이트 중...' : `메달 순위 키워드 블로그 ID 자동 업데이트 (${updatableKeywordsCount}개)`}
          </button>
        )}
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="keyword">키워드</label>
          <input
            id="keyword"
            className={styles.input}
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="예: 사회복지사2급 자격증"
            autoComplete="off"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="blogId">블로그 ID (선택)</label>
          <div style={{ position: 'relative' }}>
            <input
              id="blogId"
              className={styles.input}
              type="text"
              value={blogIdInput}
              onChange={(e) => setBlogIdInput(e.target.value)}
              placeholder={isFetchingBlogId ? '블로그 ID 찾는 중...' : '예: windusj'}
              autoComplete="off"
              disabled={isFetchingBlogId}
            />
            {isFetchingBlogId && (
              <span style={{ 
                position: 'absolute', 
                right: '12px', 
                top: '50%', 
                transform: 'translateY(-50%)',
                fontSize: '12px',
                color: '#6b7280'
              }}>
                검색 중...
              </span>
            )}
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="memo">메모 (선택)</label>
          <input
            id="memo"
            className={styles.input}
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder="메모를 입력하세요"
            autoComplete="off"
          />
        </div>
        <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
          {isSubmitting ? '등록 중...' : '키워드 등록'}
        </button>
      </form>

      {error && <div className={styles.errorMessage}>{error}</div>}
      {successMessage && <div className={styles.successMessage}>{successMessage}</div>}

      <div className={styles.tabs}>
        {CATEGORIES.map((category) => {
          const count = categoryCounts[category];
          const isActive = activeTab === category;
          const hasKeywords = count > 0;
          
          return (
            <button
              key={category}
              type="button"
              className={`${styles.tab} ${isActive ? styles.tabActive : ''} ${!hasKeywords ? styles.tabDisabled : ''}`}
              onClick={() => {
                setActiveTab(category);
              }}
            >
              {category}
              {hasKeywords && <span className={styles.tabCount}>({count})</span>}
            </button>
          );
        })}
      </div>

      {fetchState === 'loading' && keywords.length === 0 ? (
        <div className={styles.contentPlaceholder}>키워드 목록을 불러오는 중입니다...</div>
      ) : (
        <div className={styles.keywordGroups}>
          <div className={`${styles.categorySection} ${activeTab === '사회복지사' ? styles.categorySectionLarge : ''}`}>
            <h2 className={styles.categoryTitle}>{activeTab}</h2>
            {keywords.length === 0 ? (
              <div className={styles.emptyState}>
                아직 등록된 키워드가 없습니다.
                <br />
                상단 폼을 사용해 키워드를 등록해보세요.
              </div>
            ) : filteredKeywords.length === 0 ? (
              <div className={styles.emptyState}>
                {activeTab} 탭에 등록된 키워드가 없습니다.
                <br />
                상단 폼을 사용해 키워드를 등록해보세요.
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>키워드</th>
                      <th style={{ width: '18%' }}>메달</th>
                      <th style={{ width: '15%' }}>블로그 ID</th>
                      <th style={{ width: '15%' }}>검색량</th>
                      <th style={{ width: '17%' }}>등록일</th>
                      {isAdmin && <th style={{ width: 'auto' }}>작업</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKeywords.map((item) => {
                      const ranking = item.blog?.ranking ?? null;
                      const hasBlog = !!(item.blog_id && item.blog_id.length > 0);
                      const medalImage = ranking && ranking >= 1 && ranking <= 3 ? medalAssets[ranking] : null;
                      const medalLabel =
                        ranking && ranking > 0 && ranking <= 3
                          ? `${ranking}위 노출`
                          : '미노출';
                      const badgeClass =
                        ranking && ranking > 0 && ranking <= 3
                          ? styles.badge
                          : `${styles.badge} ${styles.badgeMuted}`;
                      // 클라이언트 상태의 검색량을 우선 사용 (한번 가져온 값 유지), 없으면 DB 값 사용
                      // DB에 저장하지 않으므로 비용 절감
                      const searchVolume = searchVolumes[item.keyword] ?? item.blog?.search_volume ?? null;
                      const isFetchingVolume = fetchingSearchVolumes.has(item.keyword);

                      return (
                        <tr key={item.id}>
                          <td>{item.keyword}</td>
                          <td>
                            <span className={badgeClass}>
                              {medalImage ? <img src={medalImage} alt={medalLabel} /> : null}
                              {medalLabel}
                            </span>
                          </td>
                          <td>{hasBlog ? item.blog_id : '-'}</td>
                          <td>
                            {isFetchingVolume ? (
                              <span style={{ color: '#6b7280', fontSize: '12px' }}>조회 중...</span>
                            ) : searchVolume !== null ? (
                              searchVolume.toLocaleString()
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>
                            {new Date(
                              item.blog?.created_at || item.created_at
                            ).toLocaleDateString('ko-KR')}
                          </td>
                          {isAdmin && (
                            <td>
                              <button
                                type="button"
                                onClick={() => handleDeleteKeyword(item.id, item.keyword)}
                                className={styles.deleteButton}
                                title="키워드 삭제"
                              >
                                삭제
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
