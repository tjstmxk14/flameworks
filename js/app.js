const GOOGLE_SHEET_ID = "1GakBnRrG4DS02deVaHGvE70LpP9qo0HOdf6ClgyhLgA"; 

let debounceTimer;
let isFetchingFullData = false;
let isCheckingVersion = false; // 중복 버전 체크 방지 플래그

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    setupEventListeners();
    
    const cachedData = localStorage.getItem('b2b_catalog_data');
    const cachedVersion = localStorage.getItem('b2b_catalog_version');

    if (cachedData && cachedVersion) {
        // [SWR 패턴] 1. 일단 캐시된 데이터로 0초 만에 렌더링
        try {
            const parsedCache = JSON.parse(cachedData);
            processJSONData(parsedCache, false); // 초기 렌더링(캐시)
            
            // 2. 그려놓고 백그라운드에서 Z1 셀 몰래 검사
            checkVersionFromGoogleSheet(); 
        } catch(e) {
            fetchFullDataFromGoogleSheet();
        }
    } else {
        // 캐시가 없으면 바로 전체 데이터 요청
        fetchFullDataFromGoogleSheet();
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                applyFilters();
            }, 300);
        });
    }

    const grid = document.getElementById('catalog-grid');
    if (grid) {
        grid.addEventListener('click', handleCardInteractions);
        
        let touchstartX = 0;
        grid.addEventListener('touchstart', e => {
            const slider = e.target.closest('.slider-container');
            if (slider) touchstartX = e.changedTouches[0].screenX;
        }, {passive: true});

        grid.addEventListener('touchend', e => {
            const slider = e.target.closest('.slider-container');
            if (slider) {
                const touchendX = e.changedTouches[0].screenX;
                const imgBox = slider.closest('.img-box');
                if (touchendX < touchstartX - 30) moveSlide(imgBox, 1);
                if (touchendX > touchstartX + 30) moveSlide(imgBox, -1);
            }
        }, {passive: true});
    }

    const filterWrap = document.getElementById('category-filters');
    if (filterWrap) {
        filterWrap.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                applyFilters(); 
            }
        });
    }

    const modalImgContainer = document.getElementById('modalImg');
    if (modalImgContainer) {
        let modalTouchStartX = 0;
        modalImgContainer.addEventListener('touchstart', e => {
            modalTouchStartX = e.changedTouches[0].screenX;
        }, {passive: true});
        
        modalImgContainer.addEventListener('touchend', e => {
            const touchendX = e.changedTouches[0].screenX;
            const imgBox = modalImgContainer.querySelector('.img-box');
            if(imgBox && imgBox.querySelector('.slider-container')) {
                if (touchendX < modalTouchStartX - 30) moveSlide(imgBox, 1);
                if (touchendX > modalTouchStartX + 30) moveSlide(imgBox, -1);
            }
        }, {passive: true});

        modalImgContainer.addEventListener('click', e => {
            const sliderBtn = e.target.closest('.slider-btn');
            const sliderDot = e.target.closest('.slider-dot');
            if (sliderBtn) {
                e.stopPropagation();
                const imgBox = sliderBtn.closest('.img-box');
                const direction = sliderBtn.classList.contains('prev') ? -1 : 1;
                moveSlide(imgBox, direction);
            } else if (sliderDot) {
                e.stopPropagation();
                const imgBox = sliderDot.closest('.img-box');
                const index = parseInt(sliderDot.dataset.index, 10);
                goToSlide(imgBox, index);
            }
        });
    }

    // [최적화 핵심] 탭으로 돌아올 때 버전 찔러보기
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkVersionFromGoogleSheet();
        }
    });

    // 헤더의 새로고침 버튼 수동 갱신 연결
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchFullDataFromGoogleSheet(true); // 수동 강제 갱신
        });
    }
}

function checkVersionFromGoogleSheet() {
    if (isFetchingFullData || isCheckingVersion) return; 
    isCheckingVersion = true;

    const scriptId = 'google-sheet-version-jsonp';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) existingScript.remove(); 

    const script = document.createElement('script');
    script.id = scriptId;
    const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:versionCheckCallback&range=Z1&t=${new Date().getTime()}`;
    
    script.src = url;
    script.onerror = () => { isCheckingVersion = false; };
    document.head.appendChild(script);
}

window.versionCheckCallback = function(jsonObj) {
    isCheckingVersion = false;
    const script = document.getElementById('google-sheet-version-jsonp');
    if (script) script.remove();

    let latestVersion = "";
    try {
        if (jsonObj && jsonObj.table) {
            if (jsonObj.table.rows.length > 0 && jsonObj.table.rows[0].c[0] && jsonObj.table.rows[0].c[0].v) {
                latestVersion = jsonObj.table.rows[0].c[0].v.toString();
            } else if (jsonObj.table.cols.length > 0 && jsonObj.table.cols[0].label) {
                latestVersion = jsonObj.table.cols[0].label.toString();
            }
        }
    } catch(e) {}

    const cachedVersion = localStorage.getItem('b2b_catalog_version');

    // [핵심 변경점] 버전 다르면 토스트 UI 띄우지 말고 바로 강제 렌더링 시전
    if (latestVersion && latestVersion !== cachedVersion) {
        localStorage.setItem('b2b_catalog_version', latestVersion);
        fetchFullDataFromGoogleSheet(true); // 자동 갱신이지만 화면 리셋(로딩) 허용
    }
};

function fetchFullDataFromGoogleSheet(forceLoadingUI = false) {
    isFetchingFullData = true;
    
    // 강제 갱신이거나 캐시가 없을 때만 로딩바 표시
    if (forceLoadingUI || !localStorage.getItem('b2b_catalog_data')) {
        showLoading(true);
        // 사용자 검색어나 필터 초기화 방지를 위해 UI 리셋은 최소화 (그리드 숨김 처리만)
    }

    const scriptId = 'google-sheet-full-jsonp';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) existingScript.remove(); 

    const script = document.createElement('script');
    script.id = scriptId;
    const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:googleSheetCallback&t=${new Date().getTime()}`;
    
    script.src = url;
    script.onerror = function() {
        showLoading(false, true);
        isFetchingFullData = false;
    };
    document.head.appendChild(script);
}

window.googleSheetCallback = function(jsonObj) {
    const script = document.getElementById('google-sheet-full-jsonp');
    if (script) script.remove();
    isFetchingFullData = false;

    try {
        localStorage.setItem('b2b_catalog_data', JSON.stringify(jsonObj));
        // 전체 다운 받았으니 버전 동기화 (보험용)
        checkVersionFromGoogleSheet();
    } catch(e) {}

    processJSONData(jsonObj, true); // 새로 받아온 데이터 렌더링
};

function processJSONData(json, isNewData = false) {
    if (!json || !json.table || !json.table.rows || json.table.rows.length === 0) {
        showLoading(false, true);
        return;
    }

    let headers = [];
    let dataStartIndex = 0;

    const hasLabels = json.table.cols.some(col => col.label && col.label.trim() !== "");
    if (hasLabels) {
        headers = json.table.cols.map(col => (col.label || "").replace(/\s+/g, ''));
        dataStartIndex = 0;
    } else {
        const headerRow = json.table.rows[0].c;
        headers = headerRow.map(cell => cell ? (cell.v || "").toString().replace(/\s+/g, '') : "");
        dataStartIndex = 1;
    }

    const parsedData = [];
    for (let r = dataStartIndex; r < json.table.rows.length; r++) {
        const rowObj = {};
        const rowData = json.table.rows[r].c;
        if (!rowData) continue;
        
        let isEmptyRow = true;
        for (let c = 0; c < headers.length; c++) {
            if (headers[c]) {
                let val = "";
                if (rowData[c] && rowData[c].v !== null && rowData[c].v !== undefined) {
                    val = rowData[c].v.toString();
                    isEmptyRow = false;
                }
                rowObj[headers[c]] = val;
            }
        }
        if (!isEmptyRow) parsedData.push(rowObj);
    }

    renderData(parsedData, isNewData);
}

function renderData(data, isNewData) {
    const grid = document.getElementById('catalog-grid');
    const uniqueCategories = new Set();
    let htmlBuffer = ""; 

    data.forEach((row) => {
        const getVal = (possibleKeys) => {
            const foundKey = Object.keys(row).find(k => possibleKeys.includes(k.replace(/\s+/g, '')));
            return foundKey ? row[foundKey] : "";
        };

        const category = getVal(["분류(카테고리)", "분류", "카테고리", "시즌"]) || "기본";
        const code = getVal(["품번", "상품코드", "모델명"]);
        const name = getVal(["상품명", "상품", "이름"]);
        
        if (!code && !name) return; 

        let wholesale = getVal(["도매가", "도매", "도매단가"]);
        let retail = getVal(["소비자가", "소비자"]);
        wholesale = wholesale ? parseInt(wholesale.replace(/[^0-9]/g, '')).toLocaleString('ko-KR') : "0";
        retail = retail ? parseInt(retail.replace(/[^0-9]/g, '')).toLocaleString('ko-KR') : "0";
        
        const material = getVal(["소재", "재질"]);
        const heel = getVal(["굽높이", "굽"]);
        const color = getVal(["컬러", "색상"]);
        const size = getVal(["사이즈", "크기"]);

        let imgUrls = [];
        for(let i=1; i<=5; i++) {
            let url = getVal([`이미지URL${i}`, `이미지${i}`, `이미지url${i}`]);
            if(!url && i===1) url = getVal(["이미지URL", "이미지"]);
            
            if (url && typeof url === 'string') {
                url = url.trim();
                if (url !== '' && !url.startsWith('http') && !url.startsWith('data:')) url = 'https://' + url;
                if (url !== '') imgUrls.push(url);
            }
        }

        uniqueCategories.add(category);
        const searchString = String((code || "") + " " + (name || "")).toLowerCase().replace(/["']/g, '');

        htmlBuffer += buildCardHTMLString({category, imgUrls, code, name, wholesale, retail, material, heel, color, size, searchString});
    });

    grid.innerHTML = htmlBuffer;
    
    // 카테고리 필터를 처음이거나 새 데이터일 때만 다시 그림 (사용자 선택 유지 목적)
    if (!document.getElementById('category-filters').innerHTML || isNewData) {
        generateCategoryFilters(uniqueCategories);
    }
    
    showLoading(false);
    
    // 새 데이터가 그려지면 사용자가 입력해둔 검색어나 필터를 즉시 적용
    applyFilters();
}

function buildCardHTMLString(product) {
    const {category, imgUrls, code, name, wholesale, retail, material, heel, color, size, searchString} = product;
    
    let imgHTML = '';
    if (imgUrls.length === 0) {
        imgHTML = `<div class="img-box"><div style="color:#9ca3af; font-size:0.9rem;">이미지 없음</div></div>`;
    } else if (imgUrls.length === 1) {
        imgHTML = `<div class="img-box"><img src="${imgUrls[0]}" class="preview-img" loading="lazy" decoding="async"></div>`;
    } else {
        let slides = imgUrls.map((url, idx) => `<img src="${url}" class="slider-img" style="transform: translateX(-0%);" loading="lazy" decoding="async">`).join('');
        let dots = imgUrls.map((_, idx) => `<div class="slider-dot ${idx===0?'active':''}" data-index="${idx}"></div>`).join('');
        imgHTML = `
            <div class="img-box">
                <div class="slider-container" data-current="0">${slides}</div>
                <button class="slider-btn prev">❮</button>
                <button class="slider-btn next">❯</button>
                <div class="slider-dots">${dots}</div>
            </div>
        `;
    }

    return `
        <div class="ws-card" data-category="${category}" data-search-string="${searchString}">
            <div class="ws-img-wrap">
                <span class="ws-category-badge">${category}</span>
                ${imgHTML}
            </div>
            <div class="ws-info">
                <div class="ws-head-row">
                    <div class="ws-title-box">
                        <div class="ws-info-block">
                            <span class="ws-label-tag primary">모델명</span>
                            <div class="ws-code">${code}</div>
                        </div>
                        <div class="ws-info-block">
                            <span class="ws-label-tag gray">상품명</span>
                            <div class="ws-name">${name}</div>
                        </div>
                    </div>
                    <div class="ws-price-box">
                        <span class="ws-price-label">도매가</span>
                        <div class="ws-price"><span>${wholesale}</span><span style="font-size:0.9rem; font-weight:600;">원</span></div>
                        <div class="ws-retail"> <span>${retail}</span>원</div>
                    </div>
                </div>
                <table class="ws-specs">
                    <tbody>
                        <tr><th>소재</th><td>${material}</td></tr>
                        <tr><th>굽높이</th><td>${heel}</td></tr>
                        <tr><th>컬러</th><td>${color}</td></tr>
                        <tr><th>사이즈</th><td>${size}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function generateCategoryFilters(categories) {
    const filterContainer = document.getElementById('category-filters');
    const activeBtn = filterContainer.querySelector('.filter-btn.active');
    const currentActive = activeBtn ? activeBtn.innerText.trim() : '전체보기';

    let btnHtml = `<button class="filter-btn ${currentActive === '전체보기' ? 'active' : ''}">전체보기</button>`;
    
    categories.forEach(cat => {
        if(cat) {
            btnHtml += `<button class="filter-btn ${currentActive === cat ? 'active' : ''}">${cat}</button>`;
        }
    });
    filterContainer.innerHTML = btnHtml;
}

function applyFilters() {
    const searchInputEl = document.getElementById('searchInput');
    const searchInput = searchInputEl ? searchInputEl.value.toLowerCase().trim() : "";
    const searchTerms = searchInput.split(/\s+/).filter(term => term.length > 0);
    
    let activeCategory = 'ALL';
    const activeBtn = document.querySelector('.filter-btn.active');
    if (activeBtn) {
        const btnText = activeBtn.innerText.trim();
        activeCategory = btnText === '전체보기' ? 'ALL' : btnText;
    }

    const cards = document.querySelectorAll('.ws-card');
    let visibleCount = 0;

    cards.forEach(card => {
        const cardCategory = card.getAttribute('data-category') || "";
        const searchString = card.getAttribute('data-search-string') || "";
        
        const matchCategory = (activeCategory === 'ALL' || cardCategory === activeCategory);
        let matchSearch = true;
        if (searchTerms.length > 0) {
             matchSearch = searchTerms.some(term => searchString.includes(term));
        }

        if (matchCategory && matchSearch) {
            card.classList.remove('hidden');
            visibleCount++;
        } else {
            card.classList.add('hidden');
        }
    });

    const noResultsMsg = document.getElementById('no-results');
    if (noResultsMsg) {
        noResultsMsg.style.display = (visibleCount === 0 && cards.length > 0) ? 'block' : 'none';
    }
}

function handleCardInteractions(e) {
    const sliderBtn = e.target.closest('.slider-btn');
    const sliderDot = e.target.closest('.slider-dot');
    const card = e.target.closest('.ws-card');
    
    if (sliderBtn) {
        e.stopPropagation();
        const imgBox = sliderBtn.closest('.img-box');
        const direction = sliderBtn.classList.contains('prev') ? -1 : 1;
        moveSlide(imgBox, direction);
        return;
    }

    if (sliderDot) {
        e.stopPropagation();
        const imgBox = sliderDot.closest('.img-box');
        const index = parseInt(sliderDot.dataset.index, 10);
        goToSlide(imgBox, index);
        return;
    }

    if (card) {
        openModal(card);
    }
}

function moveSlide(imgBox, direction) {
    const container = imgBox.querySelector('.slider-container');
    if(!container) return;
    let current = parseInt(container.getAttribute('data-current'));
    const total = container.querySelectorAll('.slider-img').length;
    current += direction;
    if(current < 0) current = total - 1;
    if(current >= total) current = 0;
    updateSlider(imgBox, container, current);
}

function goToSlide(imgBox, index) {
    const container = imgBox.querySelector('.slider-container');
    if(!container) return;
    updateSlider(imgBox, container, index);
}

function updateSlider(imgBox, container, current) {
    container.setAttribute('data-current', current);
    container.querySelectorAll('.slider-img').forEach(img => {
        img.style.transform = `translateX(-${current * 100}%)`;
    });
    imgBox.querySelectorAll('.slider-dot').forEach((dot, idx) => {
        dot.classList.toggle('active', idx === current);
    });
}

function openModal(card) {
    const modal = document.getElementById('productModal');
    const modalImg = document.getElementById('modalImg');
    const modalInfo = document.getElementById('modalInfo');

    const imgBox = card.querySelector('.img-box').cloneNode(true);
    imgBox.style.cursor = 'default';
    modalImg.innerHTML = '';
    modalImg.appendChild(imgBox);

    const infoBox = card.querySelector('.ws-info').cloneNode(true);
    modalInfo.innerHTML = '';
    modalInfo.appendChild(infoBox);

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal(e) {
    if(e) e.stopPropagation();
    document.getElementById('productModal').classList.remove('show');
    document.body.style.overflow = '';
}

function showLoading(isLoading, isError = false) {
    const loadingEl = document.getElementById('loading');
    const grid = document.getElementById('catalog-grid');
    const filters = document.getElementById('category-filters');
    
    if (isError) {
        loadingEl.innerHTML = `
            <div style="color: #ef4444; margin-bottom: 10px; font-weight: bold;">⚠️ 데이터를 불러오지 못했습니다.</div>
            <div style="font-size: 0.95rem; color: #4b5563;">구글 시트 공유 권한을 확인해주세요.</div>
        `;
        loadingEl.style.display = 'flex';
        if(grid) grid.style.display = 'none';
        if(filters) filters.style.display = 'none';
        return;
    }

    if (isLoading) {
        loadingEl.innerHTML = `
            <div class="spinner"></div>
            <div class="loading-text">데이터를 불러오는 중입니다...</div>
        `;
        loadingEl.style.display = 'flex';
        if(grid) grid.style.display = 'none';
        if(filters) filters.style.display = 'none';
    } else {
        loadingEl.style.display = 'none';
        if(grid) grid.style.display = 'grid';
        if(filters) filters.style.display = 'flex';
    }
}