document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        search: '',
        language: 'all',
        baseFolders: new Set(),
        subFolder: '',
        mediaPrefix: 'https://www.essent.nl/-/media/',
        data: []
    };

    // DOM Elements
    const DOM = {
        grid: document.getElementById('bannerGrid'),
        count: document.getElementById('resultCount'),
        empty: document.getElementById('emptyState'),
        search: document.getElementById('searchInput'),
        languages: document.getElementById('languageFilters'),
        baseFolders: document.getElementById('baseFolderFilters'),
        subFolder: document.getElementById('subFolderSelect'),
        reset: document.getElementById('resetFilters'),
        mediaHost: document.getElementById('mediaHostInput'),
        loading: document.getElementById('loadingState')
    };

    // Initialize App
    function init() {
        const urlParams = new URLSearchParams(window.location.search);
        const archiveId = urlParams.get('id');

        if (!archiveId) {
            alert('No archive ID provided in URL');
            window.location.href = '/';
            return;
        }

        DOM.loading.classList.remove('hidden');

        fetch(`/api/banners/${archiveId}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to load data');
                return res.json();
            })
            .then(data => {
                state.data = data;
                DOM.loading.classList.add('hidden');
                setupFilters();
            })
            .catch(err => {
                console.error(err);
                alert('Could not load banners data.');
                DOM.loading.classList.add('hidden');
            });
    }

    function setupFilters() {
        const languages = [...new Set(state.data.map(b => b.Language))].filter(Boolean);
        const baseFolders = [...new Set(state.data.map(b => b.BaseFolder))].filter(Boolean).sort();

        renderLanguageFilters(languages);
        renderBaseFolderFilters(baseFolders);
        updateSubFolderFilters();

        DOM.search.addEventListener('input', (e) => { state.search = e.target.value.toLowerCase(); render(); });
        DOM.subFolder.addEventListener('change', (e) => { state.subFolder = e.target.value; render(); });
        DOM.mediaHost.addEventListener('input', (e) => { state.mediaPrefix = e.target.value; render(); });
        DOM.reset.addEventListener('click', resetFilters);

        render();
    }

    function formatDate(dtStr) {
        if (!dtStr) return 'Unknown';
        const match = dtStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
        return dtStr;
    }

    window.toggleBaseFolder = function(folder) {
        if (state.baseFolders.has(folder)) state.baseFolders.delete(folder);
        else state.baseFolders.add(folder);
        state.subFolder = '';
        updateSubFolderFilters();
        render();
    }

    function resetFilters() {
        state.search = '';
        state.language = 'all';
        state.baseFolders.clear();
        state.subFolder = '';

        DOM.search.value = '';
        document.querySelectorAll('input[name="lang"]').forEach(el => el.checked = (el.value === 'all'));
        document.querySelectorAll('input[type="checkbox"][data-type="base"]').forEach(el => el.checked = false);

        updateSubFolderFilters();
        render();
    }

    function renderLanguageFilters(langs) {
        let html = `<label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="lang" value="all" checked onchange="window.setLang('all');" class="text-indigo-600 focus:ring-indigo-500"> <span class="text-sm">All</span></label>`;
        langs.forEach(l => {
            html += `<label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="lang" value="${l}" onchange="window.setLang('${l}');" class="text-indigo-600 focus:ring-indigo-500"> <span class="text-sm">${l}</span></label>`;
        });
        DOM.languages.innerHTML = html;
    }
    
    window.setLang = function(l) {
        state.language = l;
        render();
    }

    function renderBaseFolderFilters(folders) {
        let html = '';
        folders.forEach(f => {
            html += `
            <label class="flex items-center gap-2 cursor-pointer mb-1 hover:bg-slate-50 p-1 rounded transition-colors text-sm">
                <input type="checkbox" data-type="base" value="${f}" onchange="window.toggleBaseFolder('${f}')" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                <span class="truncate" title="${f}">${f}</span>
            </label>`;
        });
        DOM.baseFolders.innerHTML = html;
    }

    function updateSubFolderFilters() {
        let filtered = state.data;
        if (state.baseFolders.size > 0) {
            filtered = state.data.filter(b => state.baseFolders.has(b.BaseFolder));
        }
        const subs = [...new Set(filtered.map(b => b.SubFolder))].filter(Boolean).sort();

        let html = `<option value="">All Subfolders</option>`;
        subs.forEach(s => {
            const selected = s === state.subFolder ? 'selected' : '';
            html += `<option value="${s}" ${selected}>${s}</option>`;
        });
        DOM.subFolder.innerHTML = html;
    }

    function render() {
        let results = state.data.filter(b => {
            if (state.search) {
                const term = state.search;
                if (!b.Name.toLowerCase().includes(term) &&
                    !((b.Title || '').toLowerCase().includes(term)) &&
                    !((b.CampaignId || '').toLowerCase().includes(term))) return false;
            }
            if (state.language !== 'all' && b.Language !== state.language) return false;
            if (state.baseFolders.size > 0 && !state.baseFolders.has(b.BaseFolder)) return false;
            if (state.subFolder && b.SubFolder !== state.subFolder) return false;
            return true;
        });

        results.sort((a, b) => {
            const dateA = a.Updated || "";
            const dateB = b.Updated || "";
            return dateB.localeCompare(dateA);
        });

        DOM.count.textContent = `${results.length} Banners`;

        if (results.length === 0) {
            DOM.grid.innerHTML = '';
            DOM.empty.classList.remove('hidden');
            return;
        } else {
            DOM.empty.classList.add('hidden');
        }

        const renderLimit = 500;
        const toRender = results.slice(0, renderLimit);
        const fragment = document.createDocumentFragment();

        toRender.forEach(b => {
            const card = document.createElement('div');
            card.className = "bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-slate-200 overflow-hidden flex flex-col h-full";

            const typeColor = b.Language === 'en' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800';

            // Construct the image HTML block if standard image exists
            let imageBlock = '';
            if (b.HeroImage) {
                const fullImageUrl = 'https://essentimages.janwillemwilmsen.workers.dev/?' + encodeURIComponent(state.mediaPrefix + b.HeroImage);
                imageBlock = `
                <div class="w-full h-24 bg-slate-100 flex items-center justify-center overflow-hidden relative group">
                    <img src="${fullImageUrl}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2394a3b8\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'></rect><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'></circle><polyline points=\\'21 15 16 10 5 21\\'></polyline></svg>'; this.classList.add('w-10', 'h-10', 'opacity-50', 'object-contain'); this.classList.remove('w-full', 'h-full');" alt="Banner Image" class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <a href="${fullImageUrl}" target="_blank" class="bg-white text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm hover:bg-slate-50 transition-colors">Full Image</a>
                    </div>
                </div>`;
            }

            card.innerHTML = `
             <div class="p-4 flex flex-col flex-1">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200 truncate" title="${b.BaseFolder} / ${b.SubFolder}">
                        ${b.BaseFolder}${b.SubFolder ? ' / ' + b.SubFolder : ''}                        
                    </span>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] whitespace-nowrap font-bold ${typeColor} uppercase tracking-wider">${b.Language}</span>
                </div>
                <h3 class="text-sm font-semibold text-slate-900 line-clamp-2 min-h-10 leading-tight mb-2" title="${b.Name}">${b.Name}</h3>
                
                ${imageBlock}
                
                <div class="mt-3">
                    ${b.Title ? `<p class="text-sm text-slate-600 mb-1 font-medium line-clamp-2" title="${b.Title}">${b.Title}</p>` : '<p class="text-sm text-slate-400 italic mb-1">No title</p>'}
                    ${b.Subtitle ? `<p class="text-[11px] text-slate-500 mb-3 line-clamp-2" title="${b.Subtitle}">${b.Subtitle}</p>` : ''}
                </div>

                <div class="mb-3 flex flex-col gap-1.5">
                    ${(() => {
                        const mainCtas = b.CTAs ? b.CTAs.filter(c => !c.Key.includes('app')) : [];
                        return mainCtas.length > 0 ? mainCtas.map(cta => `
                            <div class="bg-indigo-50 rounded p-1.5 flex flex-col border border-indigo-100">
                                <span class="text-[11px] font-medium text-slate-800 truncate" title="${cta.Text || ''}">${cta.Text || 'No Link Text'}</span>
                                <span class="text-[9px] text-indigo-600 truncate opacity-90 mt-0.5" title="${cta.Url || ''}">${cta.Url || 'No Target URL'}</span>
                            </div>
                        `).join('') : '<span class="text-[11px] font-medium text-slate-400 italic">No call-to-action</span>';
                    })()}
                </div>

                ${(() => {
                    const hasAppData = b.AppTitle || b.AppSubtitle || b.AppImage || (b.CTAs && b.CTAs.some(c => c.Key.includes('app')));
                    if (!hasAppData) return '';

                    const appCtas = b.CTAs ? b.CTAs.filter(c => c.Key.includes('app')) : [];

                    let appImageBlock = '';
                    if (b.AppImage) {
                        const fullAppImageUrl = 'https://essentimages.janwillemwilmsen.workers.dev/?' + encodeURIComponent(state.mediaPrefix + b.AppImage);
                        appImageBlock = `
                            <div class="w-full h-24 bg-slate-100 flex items-center justify-center overflow-hidden relative group mt-2 rounded">
                                <img src="${fullAppImageUrl}" onerror="this.classList.add('hidden')" alt="${b.AppImageAlt || 'App Banner Image'}" class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" title="${b.AppImageAlt || 'App Banner Image'}" />
                            </div>
                            ${b.AppImageAlt ? `<div class="mt-1 text-[10px] text-slate-500 px-1"><span class="font-medium text-slate-600">Alt text:</span> <span class="italic">${b.AppImageAlt}</span></div>` : ''}
                        `;
                    }

                    return `
                        <hr class="border-slate-100 my-3">
                        <div class="flex flex-col gap-1.5">
                            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">App Version</span>
                            ${b.AppTitle ? `<h4 class="text-sm font-semibold text-slate-800 leading-tight truncate" title="${b.AppTitle}">${b.AppTitle}</h4>` : ''}
                            ${b.AppSubtitle ? `<p class="text-[11px] text-slate-500 line-clamp-2" title="${b.AppSubtitle}">${b.AppSubtitle}</p>` : ''}
                            ${appImageBlock}
                            ${appCtas.length > 0 ? `
                            <div class="mt-2 flex flex-col gap-1.5">
                                ${appCtas.map(cta => `
                                    <div class="bg-teal-50 rounded p-1.5 flex flex-col border border-teal-100">
                                        <div class="flex justify-between items-center mb-0.5">
                                            <span class="text-[9px] font-bold text-teal-800 uppercase tracking-widest leading-none">${cta.Key.replace('action', ' action')}</span>
                                            <span class="text-[8px] text-teal-700 bg-white px-1 py-0.5 rounded shadow-sm border border-teal-100 leading-none">${cta.Type || 'No link type'}</span>
                                        </div>
                                        <span class="text-[11px] font-medium text-slate-800 truncate" title="${cta.Text || ''}">${cta.Text || 'No Link Text'}</span>
                                        <span class="text-[9px] text-teal-700 truncate opacity-90 mt-0.5" title="${cta.Url || ''}">${cta.Url || 'No Target URL'}</span>
                                    </div>
                                `).join('')}
                            </div>
                            ` : ''}
                        </div>
                        `;
                })()}

                <div class="mt-auto pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-500">
                    ${b.CampaignId ? `<div><span class="font-medium text-slate-700">Camp:</span> ${b.CampaignId}</div>` : ''}
                    <div><span class="font-medium text-slate-700">Updated:</span> ${formatDate(b.Updated)}</div>
                </div>
            </div>
            `;
            fragment.appendChild(card);
        });

        DOM.grid.innerHTML = '';
        DOM.grid.appendChild(fragment);

        if (results.length > renderLimit) {
            const notice = document.createElement('div');
            notice.className = "col-span-full text-center py-4 text-sm text-slate-500";
            notice.textContent = `Showing 1-${renderLimit} out of ${results.length} results. Please narrow down via filters.`;
            DOM.grid.appendChild(notice);
        }
    }

    init();
});
