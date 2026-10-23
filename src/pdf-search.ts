import { Component } from 'obsidian';
import { ObsidianViewer } from 'typings';

/** Pipe-separated alternatives, with double quotes protecting literal pipes. */
export function parsePDFSearchQuery(query: string): string | string[] {
    if (!query.includes('|') && !query.includes('"')) return query;
    const terms: string[] = [];
    let term = '';
    let quoted = false;
    let quotedTerm = false;
    for (let i = 0; i < query.length; i++) {
        const char = query[i];
        if (char === '"' && (quoted || !term.trim())) {
            if (quoted && query[i + 1] === '"') {
                term += '"';
                i++;
            } else {
                if (!quoted && !term.trim()) term = '';
                quoted = !quoted;
                quotedTerm = true;
            }
        } else if (char === '|' && !quoted) {
            const normalizedTerm = quotedTerm ? term.trimEnd() : term.trim();
            if (normalizedTerm.trim()) terms.push(normalizedTerm);
            term = '';
            quotedTerm = false;
        } else {
            term += char;
        }
    }
    // Keep incomplete quoted input literal while the user is typing.
    if (quoted) return query;
    const normalizedTerm = quotedTerm ? term.trimEnd() : term.trim();
    if (normalizedTerm.trim()) terms.push(normalizedTerm);
    const unique = [...new Set(terms)];
    return unique.length > 1 ? unique : unique[0] ?? '';
}

/** Adds a Chrome-like overview of pages containing search matches. */
export function mountPDFSearchHitMarkers(component: Component, viewer: ObsidianViewer) {
    const viewerContainerEl = viewer.dom?.viewerContainerEl;
    const viewerEl = viewer.pdfViewer?.viewer;
    if (!viewerContainerEl || !viewerEl) return;
    if (viewerContainerEl.querySelector('.pdf-plus-search-hit-rail')) return;

    const railEl = viewerContainerEl.createDiv({ cls: 'pdf-plus-search-hit-rail' });
    let scheduled = 0;
    const render = () => {
        scheduled = 0;
        railEl.empty();
        const findController = viewer.findController;
        const pageMatches = findController?.pageMatches;
        const pageContents = (findController as { _pageContents?: string[] } | undefined)?._pageContents;
        if (!pageMatches?.length || !viewerEl.scrollHeight) return;

        pageMatches.forEach((matches, pageIndex) => {
            if (!matches?.length) return;
            const pageEl = viewerEl.querySelector<HTMLElement>(`.page[data-page-number="${pageIndex + 1}"]`);
            if (!pageEl) return;
            const pageLength = pageContents?.[pageIndex]?.length || matches.at(-1)! + 1;
            matches.forEach((matchStart, matchIndex) => {
                const positionInPage = matchStart / pageLength;
                const markerEl = railEl.createEl('button', {
                    cls: 'pdf-plus-search-hit-marker',
                    attr: {
                        'aria-label': `Page ${pageIndex + 1}, match ${matchIndex + 1} of ${matches.length}`,
                        title: `Page ${pageIndex + 1}, match ${matchIndex + 1} of ${matches.length}`,
                    },
                });
                markerEl.style.top = `${(pageEl.offsetTop + pageEl.offsetHeight * positionInPage) / viewerEl.scrollHeight * 100}%`;
                markerEl.addEventListener('click', () => {
                    viewerContainerEl.scrollTo({
                        top: pageEl.offsetTop + pageEl.offsetHeight * positionInPage - viewerContainerEl.clientHeight / 2,
                        behavior: 'smooth',
                    });
                });
            });
        });
    };
    const scheduleRender = () => {
        if (!scheduled) scheduled = window.requestAnimationFrame(render);
    };
    const eventBus = viewer.eventBus;
    const updateEvents = ['find', 'updatefindmatchescount', 'pagesloaded', 'scalechanging'] as const;
    updateEvents.forEach((eventName) => eventBus.on(eventName, scheduleRender));
    component.register(() => {
        if (scheduled) window.cancelAnimationFrame(scheduled);
        updateEvents.forEach((eventName) => eventBus.off(eventName, scheduleRender));
        railEl.remove();
    });
    const observer = new ResizeObserver(scheduleRender);
    observer.observe(viewerContainerEl);
    component.register(() => observer.disconnect());
    const syncRailPosition = () => {
        railEl.style.transform = `translateY(${viewerContainerEl.scrollTop}px)`;
    };
    component.registerDomEvent(viewerContainerEl, 'scroll', syncRailPosition, { passive: true });
    syncRailPosition();
    scheduleRender();
}
