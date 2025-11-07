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
    // 원본 텍스트에서 이미지 패턴 제거
    const originalText = text.replace(/\[이미지\s+\d+\]/gi, '');
    
    // 한글, 숫자, 영문을 포함한 단어 추출 (더 정교한 분리)
    let processedText = originalText.replace(/[^\w\s가-힣]/g, ' ');
    
    // 전체 텍스트에서 모든 단어 패턴 추출
    const words: string[] = [];
    
    // 한글+숫자 조합 패턴 먼저 추출 (예: "2급", "1학기", "보육교사2급", "1000시간")
    // 숫자 뒤에 한글이나 영문이 붙은 경우만 추출 (순수 숫자 제외)
    const mixedPattern = /[가-힣]+\d+[가-힣]*|\d+[가-힣]+|\d+[a-zA-Z]+|[a-zA-Z]+\d+[a-zA-Z]*/g;
    let match;
    while ((match = mixedPattern.exec(processedText)) !== null) {
      words.push(match[0]);
    }
    
    // 한글+숫자 조합을 제거한 나머지 텍스트
    let remainingText = processedText;
    const mixedMatches = processedText.match(mixedPattern) || [];
    mixedMatches.forEach(m => {
      remainingText = remainingText.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
    });
    
    // 한글 연속 패턴 추출 (2-20자, 공백으로 분리된 단어들)
    const spaceSeparated = remainingText.split(/\s+/).filter(w => w.length > 0);
    spaceSeparated.forEach(chunk => {
      // 한글 연속 패턴 (전체 단어 추출)
      const koreanPattern = /[가-힣]{2,20}/g;
      const koreanMatches = chunk.match(koreanPattern);
      if (koreanMatches) {
        words.push(...koreanMatches);
        
        // 긴 단어(5자 이상)는 의미 있는 조각으로 분리
        koreanMatches.forEach(match => {
          if (match.length >= 5) {
            // 의미 있는 조각 추출: 단어 경계에서 시작하는 조각만
            // 한글 합성어는 보통 2자 단위로 조합되므로, 2의 배수 위치에서 시작하는 조각 추출
            const meaningfulFragments = new Set<string>();
            
            // 2자 조각: 0, 2, 4, 6... 위치에서 시작
            for (let i = 0; i < match.length - 1; i += 2) {
              if (i + 2 <= match.length) {
                meaningfulFragments.add(match.slice(i, i + 2));
              }
            }
            
            // 4자 조각: 0, 2, 4... 위치에서 시작
            for (let i = 0; i < match.length - 3; i += 2) {
              if (i + 4 <= match.length) {
                meaningfulFragments.add(match.slice(i, i + 4));
              }
            }
            
            // 6자 조각: 0, 2... 위치에서 시작
            for (let i = 0; i < match.length - 5; i += 2) {
              if (i + 6 <= match.length) {
                meaningfulFragments.add(match.slice(i, i + 6));
              }
            }
            
            // 8자 조각: 0 위치에서 시작
            if (match.length >= 8) {
              meaningfulFragments.add(match.slice(0, 8));
            }
            
            meaningfulFragments.forEach(fragment => {
              words.push(fragment);
            });
          }
        });
      }
      
      // 숫자 패턴은 제외 (순수 숫자는 형태소가 아님)
      // 한글+숫자 조합은 이미 mixedPattern에서 처리됨
      
      // 영문 단어 (2자 이상)
      const englishPattern = /[a-zA-Z]{2,}/g;
      const englishMatches = chunk.match(englishPattern);
      if (englishMatches) {
        words.push(...englishMatches);
      }
    });

    // 제거할 조사, 어미, 불완전한 형태 목록
    const excludePatterns = [
      /^니다$/, /^습니다$/, /^습니$/, /^으로$/, /^로$/, /^에요$/, /^해요$/, /^하는$/, /^있는$/, /^적으$/, /^적은$/, 
      /^뭐$/, /^하$/, /^있$/, /^되$/, /^되게$/, /^되도록$/, /^되다$/, /^하다$/, /^이다$/, /^있다$/, 
      /^거예요$/, /^거야$/, /^거죠$/, /^거지$/, /^게$/, /^게요$/, 
      /^까요$/, /^까$/, /^네요$/, /^네$/, /^나요$/, /^나$/, /^어요$/, /^어$/, /^아요$/, /^아$/, 
      /^지요$/, /^지$/, /^죠$/, /^죠요$/, /^요$/, /^다$/, /^을$/, /^를$/, /^이$/, /^가$/, 
      /^은$/, /^는$/, /^에$/, /^에서$/, /^로부터$/, /^까지$/, /^와$/, /^과$/, /^의$/, /^도$/, 
      /^만$/, /^조차$/, /^마저$/, /^부터$/, /^까지$/, /^처럼$/, /^같이$/, /^보다$/, /^마다$/, 
      /^대로$/, /^커녕$/, /^따라$/, /^따름$/, /^적$/, /^적이$/, /^적인$/, /^적으로$/, /^적으$/
    ];

    // 필터링: 1-20자 제한, 순수 숫자 제외, 조사/어미 제외
    const filteredWords = words
      .filter(word => {
        const trimmed = word.trim();
        
        // 순수 숫자(단일 숫자)는 제외
        if (/^\d+$/.test(trimmed)) {
          return false; // 순수 숫자 제외
        }
        
        // 숫자가 포함된 경우, 숫자 뒤에 한글이나 영문이 있어야 함
        if (/\d/.test(trimmed)) {
          // 숫자 뒤에 한글이나 영문이 있는지 확인
          if (!/[가-힣a-zA-Z]/.test(trimmed)) {
            return false; // 숫자만 있고 뒤에 문자가 없으면 제외
          }
        }
        
        // 조사/어미/불완전한 형태 제외
        if (excludePatterns.some(pattern => pattern.test(trimmed))) {
          return false;
        }
        
        // 길이와 문자 종류 체크
        return trimmed.length >= 1 && trimmed.length <= 20 && 
               (/[가-힣]/.test(trimmed) || /[a-zA-Z]{2,}/.test(trimmed) || /\d/.test(trimmed));
      })
      .map(word => word.trim())
      .filter(word => word.length > 0);

    // 빈도수 계산 - 원본 텍스트 전체에서 직접 카운트 (조사가 붙은 경우도 포함)
    const frequency: { [key: string]: number } = {};
    const uniqueWords = [...new Set(filteredWords)];
    
    uniqueWords.forEach(word => {
      // 원본 텍스트에서 단어 출현 횟수 카운트
      // 단어가 단독으로 나타나거나 조사가 붙은 경우 모두 카운트
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 단어 뒤에 한글이나 공백, 문장 끝이 오는 경우 매칭
      const regex = new RegExp(escapedWord, 'g');
      const matches = originalText.match(regex);
      frequency[word] = matches ? matches.length : 0;
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

  // 주제별 키워드 분류 (형태소 분석 결과와 별도로 사전 정의된 키워드 목록 사용)
  const categorizeTopics = (morphemes: MorphemeResult[]): TopicKeywords => {
    // 형태소 분석 결과에서 추출한 단어 목록
    const wordList = morphemes.map(m => m.word);
    
    const topicKeywords: { [topic: string]: string[] } = {
      '교육·학문': [
        '재수강', '관련', '행정절차', '아동', '환경', '등록', '학위', '시작', '강의', '대학', '과정', 
        '학습', '영유아', '목표', '유치원', '성적', '학습자', '대학교', '15', '담당자', '취업', '학사', 
        '학기', '충족', '온라인', '학점은행제', '학력', '이론', '실습', '레포트', '토론', '제공', '2년', 
        '자격', '보육', '과목', '자격증', '교사', '준비', '5세', '도입', '2026년', '과락', 
        '장애영유아보육교사', '전문학사', '학과', '시험', '과제', '인정', '대면', '진학', '대비', '통합', 
        '보육교사자격증2급', '유보통합', '취득', '유보', '교육', '학점', '보육교사2급', '아동학사', 
        '선생님', '진행', '병행', '사유', '전문가', '4개월', '학비', '실무', '학술', '연계', '기관', 
        '취업처', '문제', '직업', '학업', '프로그램', '수련', '1급', '실습처', '1년', '학생들', 
        '청소년센터', '공공기관', '평균', '교우관계', '업무', '정서', '사복', '초봉', '석사', '적응', 
        '면담', '전문성', '활동', '학교', '조건', '모두', '지원', '시간', '학습담당자', '우리', 
        '모든', '때문', '이상', '수강', '전망', '일반', '해당', '어려움', '그래서', '통해', 
        '영역', '분야', '경력', '1000시간', '재직자', '주부', '직장인들', '과중', '노년', '연봉', 
        '심리', '예정자', '사회복지사', '정신건강사회복지사', '전공', '중간고사', '기말고사', '정신건강', 
        '사회', '학점은행제란', '거듭', '자활센터', '사회복지사2급', '전문대', '청소년', '2급'
      ],
      '비즈니스·경제': [
        '무엇', '예정', '설명', '제도로', '정부', '지급', '우선', '전략', '행정절차', '또한', '특별', 
        '단기', '등록', '안내', '정책', '확보', '시대', '경쟁력', '어디', '목표', '부담', '개인', '15', 
        '이내', '취업', '구성', '제공', '수당', '확대', '도입', '2026년', '시행', '앞서', '기간', '추진', 
        '소식', '제약', '비교', '기회', '추가', '과제', '인정', '신청', '활용', '문의', '통합', '유보', 
        '최소', '플랜', '첨부', '가장', '안정', '전문가', '실무', '전망', '기관', '세대', '직장인', 
        '대상', '기획', '상황', '개입', '관심', '서비스', '선정', '역할', '운영', '급변', '센터', 
        '공공기관', '업무', '초봉', '3년', '5년', '기업', '구분', '설계', '공공', '장점', '재직자', 
        '주부', '직장인들', '현시점', '연봉', '예정자', '불안감', '증가세', '구성', '각종', '자활센터', 
        '미래', '명함', '링크'
      ],
      '건강·의학': [
        '변화', '무엇', '발생', '주의', '필수', '우선', '또한', '도움', '안내', '시작', '어디', '방법', 
        '과정', '위해', '부담', '신경', '이내', '구성', '이외', '계속', '중요성', '확대', '시행', '비용', 
        '앞서', '경우', '분들', '관리', '장애', '하단', '맞춤', '플랜', '노년층', '안정', '학술', 
        '안정성', '매우', '증가', '수련', '미약', '환자', '대상', '재활', '상황', '우울', '불안', 
        '평균', '다방면', '남녀', '구분', '설계', '분야', '의학', '검사', '만큼', '과중', '정신건강사회복지사', 
        '먼저', '무리', '건강', '정신건강', '우울감', '불안감', '증가세', '당장', '거듭', '정신건강의학', 
        '보건소', '스트레스', '면담', '활동'
      ],
      '패션·미용': [
        '005', '재수강', '004', '도움', '003', '윤희쌤', '001', '정말', '150시간', '사복', '다방면', '만큼'
      ],
      '육아·결혼': [
        '필수', '유치원', '주차별', '수당', '5세', '2세', '분리', '언제', '유보통합', '어린이집', '선생님', 
        '4개월', '20시간', '교우관계', '정서', '적응', '검사', '육아', '개월', '보건소'
      ],
      '자동차': [
        '문의', '001', '개입', '서비스', '장점', '당장'
      ],
      'IT·컴퓨터': [
        '스펙', '006', '17', '활용', '취업처', '프로그램', 'PC', '노트북', '모바일', '태블릿', '16'
      ],
      '세계여행': [
        '005', '가이드', '2세', '적기', '포함', '20시간'
      ],
      '어학·외국어': [
        'to', '수업'
      ],
      '문학·책': [
        '제목', '시대', '토론', '불안'
      ],
      '게임': [
        '스펙', '서든', '복귀', '1000시간', '모바일'
      ],
      '상품리뷰': [
        '004', '003', '분리', '17'
      ],
      '애완·반려동물': [
        '자체', '개월', '스트레스'
      ],
      '취미': [
        '경우', '가지'
      ],
      '맛집': [
        '장소', '코스', '보교', '240시간', '하단', '매우', '직장인', '150시간'
      ],
      '국내여행': [
        '코스'
      ],
      '요리·레시피': [
        '가지'
      ],
      '영화': [
        '007', '우리들'
      ],
      '인테리어·DIY': [
        '군데', '아래', '중후'
      ],
      '스포츠': [
        '복귀', '현시점'
      ],
      '음악': [
        '우리들'
      ],
      '스타·연예인': [
        '보아'
      ],
      '금칙어': [
        // 절대성 표현
        '언제나', '무조건', '완벽히', '완벽', '항상', '절대', '반드시', '필수',
        // 비교 우위 표현
        '최고', '최상', '1등', '1위', '단연', '유일', '유일하게', '오직',
        // 과장된 표현
        '100%', '확실', '보장', '담보', '약속', '신뢰', '믿음',
        // 오도성 표현
        '의사', '환자', '남성', '여성', '성별', '요가', '고자', '휴대폰',
        '강도', '최소'
      ],
    };

    const categorized: TopicKeywords = {};
    
    // 형태소 분석 결과에 나타난 키워드만 필터링하여 주제별로 분류
    Object.keys(topicKeywords).forEach(topic => {
      const foundKeywords: string[] = [];
      
      topicKeywords[topic].forEach(keyword => {
        // 정확히 일치하는 경우
        const exactMatch = wordList.find(w => w === keyword);
        if (exactMatch && !foundKeywords.includes(exactMatch)) {
          foundKeywords.push(exactMatch);
        }
        
        // 부분 일치: 형태소 분석 결과의 긴 단어가 키워드를 포함하는 경우
        const partialMatches = wordList.filter(w => 
          w.includes(keyword) && w.length > keyword.length && w !== keyword
        );
        partialMatches.forEach(match => {
          if (!foundKeywords.includes(match)) {
            foundKeywords.push(match);
          }
        });
      });
      
      if (foundKeywords.length > 0) {
        categorized[topic] = foundKeywords;
      }
    });

    return categorized;
  };

  // 금칙어 키워드 목록 (절대성 표현, 비교 우위 표현 등 - 빨간색으로 표시)
  const forbiddenKeywords = [
    // 절대성 표현
    '언제나', '무조건', '완벽히', '완벽', '항상', '절대', '반드시', '필수',
    
    // 비교 우위 표현
    '최고', '최상', '1등', '1위', '단연', '유일', '유일하게', '오직',
    
    // 과장된 표현
    '100%', '확실', '보장', '담보', '약속', '신뢰', '믿음',
    
    // 오도성 표현
    '의사', '환자', '남성', '여성', '성별', '요가', '고자', '휴대폰',
    '강도', '최소'
  ];

  // 상업 멘트 키워드 목록 (광고성 표현 - 보라색 또는 다른 색으로 표시)
  const commercialMentKeywords = [
    // 광고성 표현
    '투자', '연락처', '상담', '추천', '후기', '만족', '특별', '평생', 
    '무료', '무료상담', '저렴', '싸게', '할인', '특가', '이벤트', '혜택',
    '문의', '상담받기', '지금', '지금당장', '바로', '즉시',
    
    // 비교 우위 표현 (상업성)
    '최대한', '가장', '제일', '최대',
    
    // 기타 상업적 표현
    '광고', '홍보', '판매', '구매', '주문', '신청', '예약'
  ];

  // 본문에서 금칙어와 상업 멘트 키워드를 하이라이트하는 함수
  const highlightCommercialMents = (text: string): string => {
    // 원본 텍스트에서 금칙어와 상업 멘트 위치를 모두 기록
    type HighlightItem = { start: number; end: number; type: 'forbidden' | 'commercial'; text: string };
    const highlights: HighlightItem[] = [];
    
    // 1. 금칙어 위치 기록
    forbiddenKeywords.forEach(keyword => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 한국어는 단어 경계가 명확하지 않으므로 직접 매칭
      const regex = new RegExp(escapedKeyword, 'gi');
      let match;
      const regexCopy = new RegExp(regex.source, regex.flags); // regex 재사용을 위한 복사
      while ((match = regexCopy.exec(text)) !== null) {
        highlights.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'forbidden',
          text: match[0]
        });
      }
    });
    
    // 2. 상업 멘트 위치 기록 (금칙어와 겹치지 않는 것만)
    commercialMentKeywords.forEach(keyword => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 한국어는 단어 경계가 명확하지 않으므로 직접 매칭
      const regex = new RegExp(escapedKeyword, 'gi');
      let match;
      const regexCopy = new RegExp(regex.source, regex.flags);
      while ((match = regexCopy.exec(text)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        
        // 금칙어와 겹치는지 확인
        const overlaps = highlights.some(h => 
          h.type === 'forbidden' && (
            (start >= h.start && start < h.end) ||
            (end > h.start && end <= h.end) ||
            (start <= h.start && end >= h.end)
          )
        );
        
        if (!overlaps) {
          highlights.push({
            start,
            end,
            type: 'commercial',
            text: match[0]
          });
        }
      }
    });
    
    // 3. 위치를 시작점 기준으로 정렬하고 겹치는 부분 제거 (금칙어 우선)
    highlights.sort((a, b) => a.start - b.start);
    const finalHighlights: HighlightItem[] = [];
    highlights.forEach(current => {
      const overlaps = finalHighlights.some(existing => 
        (current.start < existing.end && current.end > existing.start)
      );
      if (!overlaps) {
        finalHighlights.push(current);
      }
    });
    
    // 4. 텍스트를 분할하여 하이라이트 적용
    if (finalHighlights.length === 0) {
      return text;
    }
    
    const parts: Array<{ text: string; type: 'forbidden' | 'commercial' | 'normal' }> = [];
    let lastIndex = 0;
    
    finalHighlights.forEach(highlight => {
      // 하이라이트 앞의 일반 텍스트
      if (highlight.start > lastIndex) {
        parts.push({
          text: text.substring(lastIndex, highlight.start),
          type: 'normal'
        });
      }
      
      // 하이라이트된 텍스트
      parts.push({
        text: text.substring(highlight.start, highlight.end),
        type: highlight.type
      });
      
      lastIndex = highlight.end;
    });
    
    // 마지막 하이라이트 뒤의 일반 텍스트
    if (lastIndex < text.length) {
      parts.push({
        text: text.substring(lastIndex),
        type: 'normal'
      });
    }
    
    // HTML 조합
    return parts.map(part => {
      if (part.type === 'normal') {
        return part.text;
      }
      const className = part.type === 'forbidden' 
        ? styles.forbiddenHighlight 
        : styles.commercialHighlight;
      return '<span class="' + className + '">' + part.text + '</span>';
    }).join('');
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
      <div className={styles.leftColumn}>
        <div className={styles.inputSection}>
          <label className={styles.label}>본문</label>
          <textarea
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="분석할 본문을 입력하세요"
            rows={10}
          />
          <button
            className={styles.analyzeButton}
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? '분석 중...' : '분석하기'}
          </button>
        </div>
        
        {content && (
          <div className={styles.contentPreview}>
            <label className={styles.label}>
              내용 ({content.length}자)
            </label>
            <div 
              className={styles.highlightedContent}
              dangerouslySetInnerHTML={{ __html: highlightCommercialMents(content) }}
            />
          </div>
        )}
      </div>

      <div className={styles.rightColumn}>
        {morphemes.length > 0 && (
          <div className={styles.resultBox}>
            <h3 className={styles.resultTitle}>형태소</h3>
            <div className={styles.morphemeList}>
              {morphemes.map((item, index) => (
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
                  <div className={`${styles.topicName} ${
                    topic === '금칙어' ? styles.forbiddenMent : ''
                  }`}>
                    {topic}
                  </div>
                  <div className={`${styles.keywords} ${
                    topic === '금칙어' ? styles.forbiddenMent : ''
                  }`}>
                    {keywords.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

