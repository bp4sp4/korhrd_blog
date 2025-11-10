'use client';

import { useState } from 'react';
import styles from './bloglist.module.css';

interface BlogItem {
  publicationDate: string;
  title: string;
  index: string;
  reliability: string;
  relevance: string;
  reflection: string;
  charCount: number;
  imageCount: number;
  likes: string;
  comments: string;
  shares: string;
  link: string;
  id: string;
  nickname: string;
  description: string;
}

interface BlogInfo {
  blogName: string;
  blogTopic: string;
  nickname: string;
  neighborCount: string;
  creationDate: string;
  operationPeriod: string;
  todayVisitors: string;
  totalScraps: string;
  monthlyPosts: string;
  totalPosts: string;
  blogIndex: string; // 블로그지수
  cRank: string; // C-RANK
  dia: string; // D.I.A
  diaPlus: string; // D.I.A+
}

export default function BlogListPage() {
  const [blogId, setBlogId] = useState('');
  const [count, setCount] = useState(30);
  const [sort, setSort] = useState('date');
  const [blogList, setBlogList] = useState<BlogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [blogInfo, setBlogInfo] = useState<BlogInfo | null>(null);

  const handleSearch = async () => {
    if (!blogId.trim()) {
      alert('블로거 ID를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/bloglist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blogId: blogId.trim(), count, sort }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '블로그 리스트를 가져오는데 실패했습니다.');
      }

      const data = await response.json();
      setBlogList(data.items || []);
      setTotal(data.total || 0);
      setBlogInfo(data.blogInfo || null);
    } catch (error: any) {
      console.error('블로그 리스트 검색 중 오류 발생:', error);
      alert(error.message || '블로그 리스트 검색 중 오류가 발생했습니다.');
      setBlogList([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>블로그 리스트</h2>

      <div className={styles.searchSection}>
        <div className={styles.searchBox}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>블로거 ID</label>
            <input
              type="text"
              className={styles.searchInput}
              value={blogId}
              onChange={(e) => setBlogId(e.target.value)}
              placeholder="블로거 ID를 입력하세요 (예: windusj)"
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
          <div className={styles.inputGroup}>
            <label className={styles.label}>정렬</label>
            <select
              className={styles.countSelect}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="date">날짜순</option>
              <option value="sim">정확도순</option>
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
        <p className={styles.description}>
          블로거 ID를 입력하면 해당 블로거의 글 목록을 가져옵니다.
          <br />
       
        </p>
      </div>

      {blogInfo && (
        <div className={styles.blogInfoSection}>
          <div className={styles.blogInfoGrid}>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>블로그명</label>
              <div className={styles.infoValue}>{blogInfo.blogName || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>블로그주제</label>
              <div className={styles.infoValue}>{blogInfo.blogTopic || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>닉네임</label>
              <div className={styles.infoValue}>{blogInfo.nickname || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>이웃수</label>
              <div className={styles.infoValue}>{blogInfo.neighborCount || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>개설일</label>
              <div className={styles.infoValue}>{blogInfo.creationDate || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>운영기간</label>
              <div className={styles.infoValue}>{blogInfo.operationPeriod || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>오늘 방문자</label>
              <div className={styles.infoValue}>{blogInfo.todayVisitors || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>총 스크랩수</label>
              <div className={styles.infoValue}>{blogInfo.totalScraps || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>한달 포스팅</label>
              <div className={styles.infoValue}>{blogInfo.monthlyPosts || '-'}</div>
            </div>
            <div className={styles.infoBox}>
              <label className={styles.infoLabel}>총 게시물</label>
              <div className={styles.infoValue}>{blogInfo.totalPosts || '-'}</div>
            </div>
          </div>
          
       
        </div>
      )}

      {total > 0 && (
        <div className={styles.totalInfo}>
          총 {total}개의 글을 찾았습니다.
        </div>
      )}

      {blogList.length > 0 && (
        <div className={styles.resultsSection}>
          <table className={styles.resultsTable}>
            <thead>
              <tr>
                <th>발행일</th>
                <th>제목</th>
                <th>지수</th>
                <th>신뢰도</th>
                <th>연관도</th>
                <th>반영도</th>
                <th>글자수</th>
                <th>이미지수</th>
                <th>공감</th>
                <th>댓글</th>
                <th>공유</th>
                <th>진단</th>
              </tr>
            </thead>
            <tbody>
              {blogList.map((item, index) => (
                <tr key={index}>
                  <td>{item.publicationDate}</td>
                  <td className={styles.titleCell}>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.titleLink}>
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </td>
                  <td>
                    <span className={styles.indexBadge}>{item.index}</span>
                  </td>
                  <td>{item.reliability || '-'}</td>
                  <td>{item.relevance || '-'}</td>
                  <td>{item.reflection || '-'}</td>
                  <td>{item.charCount.toLocaleString()}자</td>
                  <td>{item.imageCount || 0}장</td>
                  <td>{item.likes || '-'}</td>
                  <td>{item.comments || '-'}</td>
                  <td>{item.shares || '-'}</td>
                  <td>
                    <div className={styles.diagnosisIcons}>
                      <span className={styles.diagnosisIcon} title="상세보기">📋</span>
                      <span className={styles.diagnosisIcon} title="분석">검색</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && blogList.length === 0 && blogId && (
        <div className={styles.emptyState}>
          <p>검색 결과가 없습니다.</p>
        </div>
      )}

      {isLoading && (
        <div className={styles.loadingState}>
          <p>데이터를 가져오는 중...</p>
        </div>
      )}
    </div>
  );
}

