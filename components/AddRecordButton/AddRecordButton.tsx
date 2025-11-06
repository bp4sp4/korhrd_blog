'use client';

import { useState } from 'react';
import AddRecordForm from '../AddRecordForm/AddRecordForm';
import styles from './AddRecordButton.module.css';

export default function AddRecordButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className={styles.buttonContainer}>
        <button
          className={styles.addButton}
          onClick={() => setIsModalOpen(true)}
        >
          + 기록 추가
        </button>
      </div>
      <AddRecordForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

