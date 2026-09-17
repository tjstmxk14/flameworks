# Flameworks 상품 단가표

## 처음 업로드

압축을 풀고 안에 있는 index.html, catalog.csv, README.md, css 폴더, js 폴더를 저장소 첫 화면의 Add file → Upload files에 한 번에 올린 뒤 Commit changes로 저장하세요. 상위 폴더나 ZIP 파일 자체를 올리는 것이 아니라 압축 안의 파일과 폴더를 올립니다. 기존 파일은 같은 경로에 덮어씁니다.

GitHub Pages의 기존 배포 설정과 사이트 주소는 그대로 사용합니다. GitHub Pages 배포가 끝난 뒤 사이트를 확인하세요. FTP를 사용할 때도 index.html이 있는 위치에 같은 폴더 구조로 올립니다.

## 단가와 재고 변경

catalog.csv를 엑셀로 열어 C열 단가와 D~J열 사이즈별 재고를 수정하세요. 첫 줄과 열 구조는 유지합니다. 단가는 원 단위 정수입니다. 같은 모델이라도 색상별로 행이 나뉘어 있습니다.

저장할 때 CSV UTF-8(쉼표로 분리)을 선택하고 파일 이름을 catalog.csv로 유지하세요. 다음부터는 이 파일 하나만 GitHub 또는 FTP의 기존 catalog.csv 위치에 덮어쓰면 됩니다. 파일 이름이 catalog.csv.csv 또는 catalog (1).csv가 되지 않았는지 확인하세요.

내 컴퓨터의 엑셀에서 저장만 한 내용은 서버로 자동 전송되지 않습니다. 수정한 CSV를 업로드해야 다른 사람에게 반영됩니다. XLSX 파일의 확장자만 CSV로 바꿔서는 안 됩니다.

열 순서: 모델, 색상, 단가, 225, 230, 235, 240, 245, 250, 255, 이미지

재고 0은 0으로 표시하고 빈칸은 미입력으로 구분합니다. 사이즈 재고에 빈칸이 있으면 합계도 미확정으로 표시합니다. 숫자가 아닌 단가나 재고, 잘못된 열 구조는 읽기를 중단합니다. 모델명을 엑셀이 임의로 숫자로 바꾸면 앞자리 0이 없어질 수 있으므로 신규 모델 코드를 넣을 때는 텍스트로 입력하세요.

## 한글과 자동 갱신

제공한 CSV는 UTF-8 BOM과 Windows 줄바꿈으로 저장했습니다. 원본 183개 항목의 모든 셀 값은 그대로입니다. 사이트에서는 UTF-8을 먼저 확인하고 한국어 Windows의 CP949 CSV도 읽습니다. 이미 깨진 글자가 저장된 파일의 내용을 추정해서 복구하는 기능은 아닙니다.

사이트가 보이는 동안 각 요청이 끝난 뒤 30초 후 다시 CSV를 확인합니다. 접속, 창 복귀, 뒤로가기 복귀, 네트워크 재연결에도 다시 확인합니다. 짧은 시간에 겹친 복귀 이벤트는 180ms 동안 합쳐 요청합니다. 숨긴 탭에서는 확인을 멈춥니다.

CSV 요청마다 다른 주소를 사용하고 fetch의 no-store, Cache-Control: no-cache, Pragma: no-cache로 브라우저 캐시 재사용을 막습니다. 상품 데이터를 localStorage나 서비스 워커에 저장하지 않습니다. 기존 브라우저의 과거 상품 저장 키는 삭제합니다.

파일 내용이 같으면 CSV 재해석과 표 재생성을 생략합니다. 같은 상품의 단가나 재고만 달라지면 해당 셀만 수정하고 이미지 요소는 유지합니다. 검색어, 필터, 정렬 선택도 유지합니다. 상품 구성이 바뀐 경우에는 표를 다시 구성합니다.

통신이나 파일 읽기에 실패하면 과거 단가를 최신 값처럼 표시하지 않고 표를 숨깁니다. 숨겼던 화면으로 돌아올 때도 새 값을 확인하기 전까지 단가와 재고를 가립니다. 수동 새로고침 버튼은 진행 중인 요청을 교체할 수 있고 늦게 도착한 이전 응답은 새 값을 덮어쓰지 못합니다. 요청 제한 시간은 12초입니다.

현재 CSV는 16,920바이트입니다. 30초 간격으로 1시간 계속 확인한다고 계산하면 데이터 본문은 약 2.03MB입니다. HTTP 헤더와 초기 이미지 전송은 제외한 수치이며 응답 시간, 압축, 숨긴 탭 여부에 따라 실제 전송량은 달라집니다. 이미지는 기존 CSV의 외부 이미지 주소를 그대로 사용합니다.

GitHub Pages 배포 대기나 서버에 아직 올라가지 않은 수정 내용까지 브라우저에서 당겨올 수는 없습니다. 갱신 대상은 서버에 배포된 catalog.csv입니다.

## 확인 범위

Chromium에서 모의 응답을 이용한 40개 검사를 통과했습니다. 원본 183개 항목의 표시값, UTF-8 BOM, BOM 없는 UTF-8, CP949 확장 한글, 쉼표와 따옴표, 갱신 요청 옵션, 30초 확인, 탭 숨김과 복귀, 오류 복구, 늦은 응답 차단, 검색과 정렬 유지, 이미지 요소 재사용, 320~1440px 화면 폭을 확인했습니다.

실행 환경의 브라우저 URL 접근 제한 때문에 네트워크와 캐시는 모의 응답으로 시험했습니다. 주기와 화면 복귀 검사는 가상 시계를 사용했습니다. 실제 GitHub Pages 배포, 실제 브라우저 HTTP 캐시, 원격 이미지 서버, 카카오톡 앱은 이번 검사에 포함되지 않습니다. 이 압축파일을 GitHub에 직접 반영하지는 않았습니다.

## 참고

Microsoft의 Excel UTF-8 BOM 안내
https://support.microsoft.com/en-us/excel/opening-csv-utf-8-files-correctly-in-excel

Fetch 표준의 캐시 요청 모드
https://fetch.spec.whatwg.org/#concept-request-cache-mode

브라우저 EUC-KR 인코딩 표준
https://encoding.spec.whatwg.org/#euc-kr

GitHub 웹 업로드 안내
https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

GitHub Pages 배포 안내
https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
