const MODEL = 'gemini-2.5-flash';

const PROMPT = `당신은 골프 스코어카드 사진을 분석하는 도우미입니다.
사진 속 스코어카드를 보고 아래 JSON 스키마에 맞춰 정보를 추출하세요.
- totalScore: 본인(또는 스코어카드의 대표 플레이어)의 총 타수 (숫자, 모르면 null)
- par: 코스의 총 파 (숫자, 모르면 null, 알 수 없으면 72로 추정하지 말고 null)
- birdies: 버디 개수 (파보다 1타 적은 홀 수, 숫자, 모르면 0)
- eagles: 이글 개수 (파보다 2타 이상 적은 홀 수, 숫자, 모르면 0)
- companionScores: 동반자로 보이는 다른 사람들의 이름과 총 타수 배열. 이름을 알 수 없으면 "동반자 1"처럼 표기. 예: [{"name":"홍길동","score":88}]
반드시 아래 JSON 형식으로만 응답하세요. 다른 설명 텍스트는 포함하지 마세요.`;

export async function scanScorecard(apiKey, base64Image, mimeType) {
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되어 있지 않습니다. 설정에서 API 키를 입력해주세요.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: base64Image } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          totalScore: { type: 'NUMBER', nullable: true },
          par: { type: 'NUMBER', nullable: true },
          birdies: { type: 'NUMBER' },
          eagles: { type: 'NUMBER' },
          companionScores: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                score: { type: 'NUMBER' },
              },
            },
          },
        },
      },
    },
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('네트워크 오류로 Gemini API 호출에 실패했습니다. 인터넷 연결을 확인해주세요.');
  }

  if (!res.ok) {
    let msg = `Gemini API 오류 (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) msg += `: ${errJson.error.message}`;
    } catch (e) { /* ignore */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini 응답에서 결과를 찾을 수 없습니다.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('Gemini 응답을 해석할 수 없습니다. 사진을 다시 확인해주세요.');
  }

  return {
    totalScore: typeof parsed.totalScore === 'number' ? parsed.totalScore : null,
    par: typeof parsed.par === 'number' ? parsed.par : null,
    birdies: typeof parsed.birdies === 'number' ? parsed.birdies : 0,
    eagles: typeof parsed.eagles === 'number' ? parsed.eagles : 0,
    companionScores: Array.isArray(parsed.companionScores)
      ? parsed.companionScores
        .filter((c) => c && typeof c.name === 'string')
        .map((c) => ({ name: c.name, score: typeof c.score === 'number' ? c.score : null }))
      : [],
  };
}

const PRACTICE_SUMMARY_PROMPT = `당신은 골프 연습 메모를 정리해주는 도우미입니다.
아래는 사용자가 연습할 때마다 남긴 메모 목록입니다(날짜별).
메모 내용만을 바탕으로 자주 언급되는 팁, 느낀 점, 반복되는 주제나 변화를 자연스러운 한국어 문단 3~5문장으로 요약해주세요.
목록, 마크다운, 번호 매기기 없이 줄글로만 작성하세요.`;

export async function summarizePracticeTips(apiKey, practices) {
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되어 있지 않습니다. 설정에서 API 키를 입력해주세요.');
  }

  const memos = practices
    .filter((p) => p.memo && p.memo.trim())
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!memos.length) {
    throw new Error('요약할 메모가 없습니다.');
  }

  const entries = memos
    .map((p) => `- ${p.date}: ${p.memo.trim()}`)
    .join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      { parts: [{ text: `${PRACTICE_SUMMARY_PROMPT}\n\n메모 목록:\n${entries}` }] },
    ],
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('네트워크 오류로 Gemini API 호출에 실패했습니다. 인터넷 연결을 확인해주세요.');
  }

  if (!res.ok) {
    let msg = `Gemini API 오류 (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) msg += `: ${errJson.error.message}`;
    } catch (e) { /* ignore */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini 응답에서 결과를 찾을 수 없습니다.');
  }
  return text.trim();
}
