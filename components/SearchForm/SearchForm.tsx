import styles from './SearchForm.module.css';

export default function SearchForm() {
  return (
    <div className={styles.searchForm}>
      <div className={styles.formGroup}>
        <label className={styles.label}>블로그 ID</label>
        <input
          type="text"
          className={styles.input}
          defaultValue="windusj"
        />
      </div>
      <div className={styles.formGroup}>
        <label className={styles.label}>닉네임 검색</label>
        <div className={styles.inputRow}>
          <input
            type="number"
            className={styles.input}
            defaultValue="30"
          />
          <button className={styles.searchButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            검색
          </button>
        </div>
      </div>
    </div>
  );
}

