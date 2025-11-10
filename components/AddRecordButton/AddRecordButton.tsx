'use client';

import { useState } from 'react';
import AddRecordForm from '../AddRecordForm/AddRecordForm';
import styles from './AddRecordButton.module.css';

interface AddRecordButtonProps {
  currentUserId?: string | null;
  currentUserName?: string | null;
  userRole?: string | null;
}

export default function AddRecordButton({ currentUserId, currentUserName, userRole = 'member' }: AddRecordButtonProps) {
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
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        userRole={userRole}
      />
    </>
  );
}

