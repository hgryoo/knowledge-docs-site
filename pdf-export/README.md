# `pdf-export/` — CUBRID-styled PDF export for docs-site articles

PDF 한 벌만 깔끔하게 떨어지면 충분한 워크플로우다. 이 디렉터리는 **이 docs-site의 한 페이지를 받아 CUBRID 톤의 PDF로 인쇄**하는 자족형 파이프라인이며, 두 가지 시각 트랙을 한 입력에서 생성한다.

| 트랙 | 톤 | 어디서 영감을 얻나 |
|---|---|---|
| **cubrid** | 발표 데크와 동일 — 탱그램 무지개 띠, 남색 h1 + 빨강 밑줄, 주황 h2 좌측 바, 자홍 h3, 파랑 좌측 바 코드 블록, 호박 인용구 | `knowledge-slides/themes/cubrid.css` (분석서 데크 6편이 쓰는 테마) |
| **doc** | 기술 매뉴얼 톤 — 회색 얇은 가로 선, Inter 본문, 책처럼 h1 페이지 브레이크, 무채색 표 | `knowledge-docs-site/src/styles/custom.css` (Biome / Knip 계열 중립 팔레트) |

## 빠른 실행

```bash
# from knowledge-docs-site/ repo root
pdf-export/build-pdf.sh cubrid-lock-manager \
  --track both \
  --lang en \
  --header-left  "CUBRID Code Analysis" \
  --header-right "Lock Manager · 2026-05-21" \
  --footer-left  "hgryoo · Docs" \
  --footer-right "cubrid-lock-manager"
```

산출물 — PDF는 **소스 md와 같은 디렉터리** 에 떨어진다:

```
src/content/docs/code-analysis/cubrid/
├── cubrid-lock-manager.md
├── cubrid-lock-manager.assets/
├── cubrid-lock-manager.cubrid.pdf    ← 새로 생성
└── cubrid-lock-manager.doc.pdf       ← 새로 생성
```

KO 페이지는 `src/content/docs/ko/code-analysis/cubrid/` 에 같은 파일명 패턴으로 떨어진다. 두 위치는 모두 `prebuild.sh` 의 `rm -rf` 사이클에서 자동으로 stash / 복원되므로 `npm run build` 를 여러 번 돌려도 살아남는다.

다음 호출 때 본문이 바뀌지 않았으면 `--skip-build` 로 Astro 빌드를 건너뛴다.

## 다운로드 버튼

PDF 가 md 옆에 존재하면 그 페이지의 H1 아래에 자동으로 ⇣ `PDF · cubrid-tone` / ⇣ `PDF · doc-tone` 버튼이 렌더된다. 메커니즘:

1. `src/components/PageTitle.astro` 는 Starlight `PageTitle` 컴포넌트 슬롯 오버라이드. `astro.config.mjs` 의 `starlight({ components: { PageTitle: ... } })` 으로 등록.
2. 빌드 타임에 `import.meta.glob('/src/content/docs/**/*.pdf', { query: '?url' })` 로 모든 colocated PDF 의 URL 을 수집.
3. 현재 페이지의 `entry.filePath` 에서 prefix (`<dir>/<slug>.`) 를 만들고 그 prefix 로 시작하는 PDF 만 골라낸다 — 디렉터리 안쪽 PDF 는 안 잡힘.
4. 버튼은 디렉터리 내 PDF 파일명 `<slug>.<track>.pdf` 의 `<track>` 부분을 라벨로 사용. `cubrid` / `doc` 는 친화적 라벨로 매핑, 그 외 트랙은 `PDF · <track>` 형식.

새 트랙을 추가하면 (예: `print-book.css` → `<slug>.book.pdf`) 버튼이 자동으로 같이 나타난다. `trackLabel` 매핑에 한 줄 추가하면 라벨도 친화적으로 보인다.

## Roadmap (local-trees) PDFs

`build-pdf.sh` 는 `code-analysis/cubrid/<slug>` 만 다룬다. roadmap·cubrid_cv
같은 local-tree 문서는 별도 진입점 `scripts/render-roadmap.mjs` 를 쓴다.
공통 print CSS / 헤더 / 푸터 템플릿은 share — 트랙 이름도 `cubrid` 동일.

표준 시각 컨벤션 (2026-05-22 N27 batch 에서 확정):

- **페이지 1**: 문서 제목 + 본문 내 *Table of Contents* 만.
- **페이지 2 이후**: 모든 번호 섹션 (`## N. ...`) 이 새 페이지에서 시작.
  Table of Contents 와 비번호 h2 는 page-break 영향 받지 않음.
- **DOM strip** (render 시점, 소스 md 는 무수정):
    - 첫 blockquote (`> Self-contained...` 식 head note) 제거.
    - `Open Questions` / `Review Log` 섹션 전체 제거 — h2 + 해당
      `div.sl-heading-wrapper.level-h2` 의 다음 형제들을 다음 h2 wrapper
      직전까지 모두 떼어낸다. (h2.nextElementSibling 으로 walk 하면
      wrapper 내부의 anchor 만 잡혀서 본문이 안 지워지는 버그가 있음.)
- **헤더 좌측**: `CUBRID Lock Manager · <Document Name>` — 프로젝트
  번호 (N27 등) 는 *넣지 않는다*. 우측: 렌더 날짜.
- **푸터 좌측**: `hgryoo` (CUBRID 로고 모노그램 + 닉네임 만). 조직명
  (CUBRID Systems Research 등) 은 사용자가 명시 요청할 때만 추가.
- **푸터 우측**: 페이지 번호 (`N / total`). 슬러그·파일명 같은 메타는
  *넣지 않는다* — PDF 파일명이 이미 그 정보를 들고 있음.
- **PageTitle 다운로드 버튼**: PDF 안에서는 `display: none`
  (`.pdf-actions` 가 print CSS hide 리스트에 들어 있음).
- **본문에 메타데이터 필드명 노출 금지**: `\`updated:\` date` /
  `\`created:\` date` 같은 문구가 본문에 들어가면 frontmatter 를
  볼 수 없는 PDF 독자에겐 dangling reference 가 된다. 본문이
  "이 문서의 검증 시점" 같은 의미를 담으려면 *실제 날짜를 인라인*
  한다 — 예: `verified against the current CUBRID source on
  2026-05-22.` frontmatter `updated:` 를 bump 할 때는 본문의 해당
  날짜 문장도 같은 PR 에서 손본다 (`grep -n "20\\d\\d-\\d\\d-\\d\\d"
  <file>.md` 로 한 번에 확인).

호출 예 (스크립트 안에 N27 경로가 하드코딩되어 있음. 다른 프로젝트로
복제할 때는 `URL_PREFIX` / `OUT_DIR` / `DOCS` 만 수정):

```bash
node /data/hgryoo/knowledge-docs-site/pdf-export/scripts/render-roadmap.mjs
```

`astro dev` (또는 `astro preview`) 가 127.0.0.1:9998 에서 살아 있어야
한다. 스크립트는 이 dev 서버에 붙어 페이지마다 Playwright + print-cubrid.css
를 적용해 `<slug>.cubrid.pdf` 를 소스 md 옆에 떨어뜨린다.

## 왜 이렇게 만들었나 (재사용을 위한 결정 로그)

### 결정 1 — Playwright 한 가지로 두 트랙 처리

처음에는 Track A 는 Playwright, Track B 는 Typst / pandoc 으로 다른 파이프라인을 잡으려 했다. 다음 이유로 합쳤다:

1. **Mermaid가 비싸진다.** Typst 경로에서는 `<pre>```mermaid``` </pre>` 블록을 `mmdc` 로 사전에 SVG 로 굽고 다시 Typst 의 `image()` 로 박아야 한다. `@mermaid-js/mermaid-cli` 가 puppeteer 의 chromium 을 또 다운로드한다 — Playwright 의 chromium 과 중복.
2. **시각 차이는 CSS 두 벌로 충분히 표현된다.** 헤더 띠, 폰트, 색, 페이지 브레이크 정책 — 모두 `@media print` 안에서 처리 가능. 책 같은 TOC + 페이지 번호 cross-reference 만 CSS 로 어렵지만, 이 vault 의 분석서들은 본문 내부 앵커 + 첫 페이지 목차로 충분하므로 PrinceXML / WeasyPrint 까지 갈 이유가 없다.
3. **Astro 의 mermaid 런타임을 그대로 쓴다.** `astro.config.mjs` 가 CDN 의 `mermaid@11` 을 `<head>` 에 주입하고 `DOMContentLoaded` 에서 `mermaid.run()` 을 호출한다. Playwright 가 페이지를 그대로 열면 같은 스크립트가 같은 SVG 를 만든다. 이중 렌더링 없음.

결과: 의존성 한 줄 — `playwright` 디바이스 (chromium-headless-shell 113MB). 그 외 시스템 도구 도입 없음.

### 결정 2 — 두 트랙은 **CSS 만** 다르게

두 트랙의 차이는 `pdf-export/styles/print-cubrid.css` vs `print-doc.css` 단 두 파일이다. 둘 다:

- `@media print { @page { size: A4 portrait; margin: ...; } ... }` 한 덩어리.
- Starlight 의 사이드바·헤더 네브·검색 위젯·테마 토글 등을 `display: none !important` 로 제거.
- `.sl-markdown-content` 본문만 풀폭으로 펼치고 자체 폰트/색/페이지 브레이크 규칙을 적용.

새 트랙을 추가하고 싶으면 `styles/print-<name>.css` 한 파일을 더 만들고 `build-pdf.sh` 의 `case "$TRACK"` 에 `<name>` 분기를 추가하면 끝. 드라이버의 `build-pdf.mjs` 는 트랙 이름으로 CSS 파일을 자동 로드한다 (`styles/print-${args.track}.css`).

### 결정 3 — 헤더 / 푸터는 **매 호출마다 CLI 플래그로**

본문이 같아도 헤더 / 푸터 텍스트는 매번 다르다 (날짜, 청중, 발표 자리, 버전 라벨…). 그래서:

- CSS 안에는 헤더 / 푸터 텍스트가 *없다*. CSS 는 본문 시각만 책임진다.
- 헤더 / 푸터는 Playwright 의 `headerTemplate` / `footerTemplate` 으로 페이지 여백에 인쇄된다. 이 템플릿은 본문 CSS 와 별도 sandbox 라 인라인 스타일로 작성한다 (`build-pdf.mjs` 의 `buildHeaderTemplate` / `buildFooterTemplate`).
- `build-pdf.sh` 의 4 개 플래그 — `--header-left`, `--header-right`, `--footer-left`, `--footer-right` — 가 그대로 템플릿의 `${left} ${right}` 로 흘러간다.

페이지 번호는 자동 — `<span class="pageNumber">` / `<span class="totalPages">` 가 Chrome 인쇄 엔진에서 채워진다.

### 결정 4 — Mermaid + lazy 이미지는 **각각의 게이트로 기다린 후** print CSS 주입

`build-pdf.mjs` 에는 세 단계 wait 가 직렬로 있다:

```js
await page.goto(url, { waitUntil: 'networkidle' });

// 1. mermaid SVG가 다 생길 때까지
await page.waitForFunction(() => {
  const blocks = document.querySelectorAll('pre.mermaid');
  if (blocks.length === 0) return true;
  return Array.from(blocks).every((b) => b.querySelector('svg'));
}, { timeout: 45000 });

// 2. lazy 이미지 강제 로딩 — Astro/Starlight 는 markdown 이미지에
//    loading="lazy" 를 자동 부착한다. Playwright 의 networkidle 은
//    뷰포트 밖의 lazy 이미지를 기다려주지 않으므로 직접 풀어야 한다.
await page.evaluate(async () => {
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
    img.removeAttribute('loading');
    img.removeAttribute('fetchpriority');
  });
  const step = 600;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
await page.waitForFunction(() => {
  return Array.from(document.images).every(
    (img) => img.complete && img.naturalWidth > 0
  );
}, { timeout: 30000 });

// 3. 모든 게 자리잡은 뒤 CSS 주입 + print media
await page.addStyleTag({ content: cssContent });
await page.emulateMedia({ media: 'print' });
```

순서가 중요하다:

- CSS 를 먼저 주입하면 mermaid 의 자체 크기 계산이 print CSS 와 충돌해 SVG 크기가 0 으로 떨어진 사례가 있었다. 끝난 뒤 주입하면 SVG 가 정해진 width/height 를 갖고 print CSS 가 `max-width: 100%` / `max-height: 215mm` 같은 추가 제약만 거는 형태가 된다.
- 이미지 로딩 강제는 mermaid 게이트 *후* 에 해야 한다. mermaid 가 SVG 를 렌더하면서 페이지 높이가 변하기 때문에, 그 전에 스크롤하면 잘못된 좌표로 뛴다.

`networkidle` 대신 `domcontentloaded` 만 기다리면 CDN 의 mermaid mjs 가 아직 안 받아질 수 있다. 정확히는 mermaid 가 *receive + parse + render* 까지 끝나야 한다 — `waitForFunction` 으로 SVG 출현을 확인하는 게 가장 단순하고 정확하다.

### 결정 5 — 파일 레이아웃

```
pdf-export/
├── README.md                # 이 파일
├── build-pdf.sh             # 사용자 진입점 — slug + flags
├── scripts/
│   └── build-pdf.mjs        # Playwright 드라이버
├── styles/
│   ├── print-cubrid.css     # Track A — cubrid-tone (Track 추가 시 여기에 한 줄)
│   └── print-doc.css        # Track B — doc-tone
├── assets/
│   ├── cubrid-logo.png      # 700px transparent (예비)
│   └── cubrid-logo-small.png# 193x90, 푸터에 임베드 (cubrid track)
└── dist/                    # 출력. gitignored (`dist/` 패턴이 잡음)
```

`assets/` 의 로고는 `knowledge-slides/themes/assets/cubrid/` 에서 복사. 변경되면 같은 자리에서 가져오면 된다.

## 트러블슈팅

| 증상 | 원인 / 처치 |
|---|---|
| `error: astro preview did not start on port 9979` | 다른 프로세스가 포트 점유. `--port 8888` 등으로 바꿔서 재시도. |
| Playwright 가 `Executable doesn't exist` 라 함 | `npx playwright install chromium` 을 한 번 더. 이미 `node_modules/playwright` 가 설치되어 있다면 chromium 만 다운로드. |
| Mermaid 가 PDF 에서 빈 박스로 나옴 | 1) 페이지가 정말 mermaid 블록을 가지고 있는지 확인. 2) CDN 차단 (오프라인 환경) — 그 경우 mermaid 를 로컬 번들로 바꿔야 함. 3) 45 초 타임아웃을 늘리고 다시. |
| 한글이 □ 로 나옴 | Pretendard / Noto Sans KR 폰트가 시스템에 없음. Chromium headless 는 시스템 폰트를 따른다. `apt install fonts-noto-cjk` 또는 Pretendard 설치 후 재실행. |
| 코드 블록이 잘림 | `print-*.css` 의 `font-size: 8.5pt` 또는 `8.8pt` 를 더 줄이거나, 본문 마크다운에서 한 줄 길이를 줄인다. CSS 의 `page-break-inside: avoid` 는 한 블록이 한 페이지를 넘기지 못하면 다음 페이지로 미루는 효과만 있다. |
| 헤더 / 푸터가 안 보임 | Chromium 의 옛 버그 — 헤더 템플릿이 너무 작은 `font-size` 면 무시된다. 인라인 `font-size: 8pt` 이상으로 유지. 마진을 `22mm` 미만으로 줄이면 헤더 영역이 안 생긴다. |

## 다른 vault 로 이식할 때

이 디렉터리 자체가 자족적이라 다른 Astro / Starlight 사이트에도 비슷하게 쓸 수 있다. 옮길 때 손볼 곳:

1. **URL 패턴.** `build-pdf.mjs` 의 `articleUrl()` — 현재는 `/code-analysis/cubrid/<slug>/`. 다른 사이트 구조면 여기를 바꾼다.
2. **Starlight 가 아닌 사이트.** `.sl-markdown-content`, `.sidebar`, `header.header` 같은 셀렉터가 다르다. 두 print CSS 의 selector 만 갈아끼우면 된다.
3. **Mermaid 가 없는 사이트.** `waitForFunction` 의 mermaid gate 가 즉시 통과한다 (`blocks.length === 0` 분기) — 코드 수정 불필요.
4. **다른 브랜드 톤.** `styles/print-<brand>.css` 를 새로 작성. 헤더 / 푸터 템플릿의 그라데이션 / 색은 `build-pdf.mjs` 의 `TANGRAM_GRADIENT` 같은 상수만 갈면 된다.

## 출처

- `knowledge-slides/themes/cubrid.css` — 슬라이드 톤 팔레트와 헤딩 스타일 출처.
- `knowledge-docs-site/src/styles/custom.css` — 닥스 톤 팔레트와 폰트 출처.
- Playwright [page.pdf() 문서](https://playwright.dev/docs/api/class-page#page-pdf) — `headerTemplate` / `footerTemplate` 의 특수 클래스(`pageNumber`, `totalPages`).
