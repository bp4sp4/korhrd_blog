'use client';

import { useState, useMemo } from 'react';
import { TableData } from './Table';
import styles from './Table.module.css';

const FIELDS = [
  '전체',
  '사회복지사',
  '보육교사',
  '한국어교원',
  '평생교육사',
  '편입',
  '대학원',
  '대졸자전형',
  '일반과정',
  '산업기사/기사',
];

interface TableClientProps {
  data: TableData[];
}

export default function TableClient({ data }: TableClientProps) {
  const [filters, setFilters] = useState({
    id: '',
    field: '전체',
    keyword: '',
    ranking: '',
    searchVolume: '',
    title: '',
    author: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (filters.id && !item.id.toLowerCase().includes(filters.id.toLowerCase())) {
        return false;
      }
      if (filters.field !== '전체' && item.field !== filters.field) {
        return false;
      }
      if (filters.keyword && !item.keyword.toLowerCase().includes(filters.keyword.toLowerCase())) {
        return false;
      }
      if (filters.ranking && item.ranking !== Number(filters.ranking)) {
        return false;
      }
      if (filters.searchVolume && item.searchVolume < Number(filters.searchVolume)) {
        return false;
      }
      if (filters.title && !item.title.toLowerCase().includes(filters.title.toLowerCase())) {
        return false;
      }
      if (filters.author && !item.author.toLowerCase().includes(filters.author.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [data, filters]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters({
      id: '',
      field: '전체',
      keyword: '',
      ranking: '',
      searchVolume: '',
      title: '',
      author: '',
    });
    setCurrentPage(1);
  };

  return (
    <div>
      <div className={styles.filterSection}>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>아이디</label>
            <input
              type="text"
              className={styles.filterInput}
              value={filters.id}
              onChange={(e) => handleFilterChange('id', e.target.value)}
              placeholder="아이디 검색"
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>분야</label>
            <select
              className={styles.filterSelect}
              value={filters.field}
              onChange={(e) => handleFilterChange('field', e.target.value)}
            >
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>키워드</label>
            <input
              type="text"
              className={styles.filterInput}
              value={filters.keyword}
              onChange={(e) => handleFilterChange('keyword', e.target.value)}
              placeholder="키워드 검색"
            />
          </div>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>상위노출 순위</label>
            <input
              type="number"
              className={styles.filterInput}
              value={filters.ranking}
              onChange={(e) => handleFilterChange('ranking', e.target.value)}
              placeholder="순위"
              min="1"
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>검색량 (이상)</label>
            <input
              type="number"
              className={styles.filterInput}
              value={filters.searchVolume}
              onChange={(e) => handleFilterChange('searchVolume', e.target.value)}
              placeholder="최소 검색량"
              min="0"
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>제목</label>
            <input
              type="text"
              className={styles.filterInput}
              value={filters.title}
              onChange={(e) => handleFilterChange('title', e.target.value)}
              placeholder="제목 검색"
            />
          </div>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>작성자</label>
            <input
              type="text"
              className={styles.filterInput}
              value={filters.author}
              onChange={(e) => handleFilterChange('author', e.target.value)}
              placeholder="작성자 검색"
            />
          </div>
        </div>
        <div className={styles.filterActions}>
          <button
            className={`${styles.filterButton} ${styles.secondary}`}
            onClick={handleResetFilters}
          >
            필터 초기화
          </button>
          <div style={{ flex: 1 }} />
          <span className={styles.paginationInfo}>
            총 {filteredData.length}개 결과
          </span>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>아이디</th>
                <th>분야</th>
                <th>키워드</th>
                <th>상위노출 순위</th>
                <th>검색량</th>
                <th>제목</th>
                <th>링크</th>
                <th>작성자</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {paginatedData.length > 0 ? (
                paginatedData.map((item, index) => (
                  <tr key={`${item.id}-${index}`}>
                    <td>{item.id}</td>
                    <td>{item.field}</td>
                    <td>{item.keyword}</td>
                    <td>{item.ranking}</td>
                    <td>{item.searchVolume.toLocaleString()}</td>
                    <td>{item.title}</td>
                    <td>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.link}
                      >
                        {item.link}
                      </a>
                    </td>
                    <td>{item.author}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className={styles.emptyState}>
                    <p>검색 결과가 없습니다.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.paginationButton}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              이전
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                if (totalPages <= 7) return true;
                return (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 2 && page <= currentPage + 2)
                );
              })
              .map((page, index, array) => {
                if (index > 0 && array[index - 1] !== page - 1) {
                  return (
                    <span key={`ellipsis-${page}`}>
                      <span className={styles.paginationInfo}>...</span>
                      <button
                        className={`${styles.paginationButton} ${
                          currentPage === page ? styles.active : ''
                        }`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    </span>
                  );
                }
                return (
                  <button
                    key={page}
                    className={`${styles.paginationButton} ${
                      currentPage === page ? styles.active : ''
                    }`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                );
              })}
            <button
              className={styles.paginationButton}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

