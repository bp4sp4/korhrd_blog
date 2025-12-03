import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    try {
      const response = await fetch(
        `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(query)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&q_enc=UTF-8&st=100&_callback=`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Referer': 'https://www.naver.com/',
          },
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        return NextResponse.json({ suggestions: [] });
      }

      const text = await response.text();
      // JSONP 응답 파싱
      const jsonMatch = text.match(/^[^(]*\((.+)\);?$/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1]);
        if (data.items && data.items[0]) {
          const suggestions = data.items[0].map((item: any[]) => item[0]);
          return NextResponse.json({ suggestions: suggestions.slice(0, 10) });
        }
      }

      return NextResponse.json({ suggestions: [] });
    } catch (error) {
      console.error('[autocomplete] 네이버 자동완성 API 오류:', error);
      return NextResponse.json({ suggestions: [] });
    }
  } catch (error: any) {
    console.error('[autocomplete] API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error?.message },
      { status: 500 }
    );
  }
}

