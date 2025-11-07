"use client";

import React from "react";
import styles from "./Pagination.module.css";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  showPageSizeSelector = true,
  className = "",
}: PaginationProps) {
  // 페이지 번호 생성 로직
  const generatePageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // 전체 페이지가 5개 이하면 모두 표시
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 첫 페이지
      pages.push(1);

      if (currentPage <= 3) {
        // 현재 페이지가 앞쪽에 있을 때
        for (let i = 2; i <= Math.min(4, totalPages - 1); i++) {
          pages.push(i);
        }
        if (totalPages > 4) {
          pages.push("...");
        }
      } else if (currentPage >= totalPages - 2) {
        // 현재 페이지가 뒤쪽에 있을 때
        if (totalPages > 4) {
          pages.push("...");
        }
        for (let i = Math.max(totalPages - 3, 2); i <= totalPages - 1; i++) {
          pages.push(i);
        }
      } else {
        // 현재 페이지가 중간에 있을 때
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("...");
      }

      // 마지막 페이지
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = generatePageNumbers();
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  if (totalPages <= 1) {
    return (
      <div className={`${styles.pagination} ${className}`}>
        <div className={styles.pageInfo}>
          총 {totalCount}개 항목
          {showPageSizeSelector && onPageSizeChange && (
            <select
              className={styles.pageSizeSelect}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}개씩
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.pagination} ${className}`}>
      {/* 페이지네이션 컨테이너 */}
      <div className={styles.paginationContainer}>
        {/* 이전 페이지 버튼 */}
        <button
          className={styles.navButton}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="line-icon"
          >
            <path
              d="M14.3 17.4c-.2 0-.5-.1-.6-.3l-4.5-4.5c-.4-.4-.4-.9 0-1.3l4.5-4.5c.4-.4.9-.4 1.3 0s.4.9 0 1.3L11 12l3.9 3.9c.4.4.4.9 0 1.3-.2.1-.4.2-.6.2z"
              fill="#a8b2bc"
            ></path>
          </svg>
        </button>

        {/* 페이지 번호들 */}
        {pageNumbers.map((page, index) => {
          if (page === "...") {
            return (
              <span key={`ellipsis-${index}`} className={styles.ellipsis}>
                ...
              </span>
            );
          }

          const pageNumber = page as number;

          return (
            <button
              key={pageNumber}
              className={`${styles.paginationButton} ${
                currentPage === pageNumber ? styles.active : styles.inactive
              }`}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          );
        })}

        {/* 다음 페이지 버튼 */}
        <button
          className={styles.navButton}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="m9.733 17.342c-.23 0-.46-.088-.636-.264-.352-.352-.352-.922 0-1.273l3.896-3.896-3.867-3.867c-.352-.351-.352-.921 0-1.272.352-.352.921-.352 1.272 0l4.504 4.503c.169.168.264.397.264.636s-.096.468-.264.636l-4.534 4.533c-.176.176-.406.264-.636.264z"
              fill="#b0b8c1"
            ></path>
          </svg>
        </button>
      </div>
    </div>
  );
}

