function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
}

function sanitizeUrl(url, { allowLocalAsset = false } = {}) {
    const trimmed = (url || "").trim();
    if (!trimmed) return null;

    if (allowLocalAsset && /^note-assets[\\/]/i.test(trimmed)) {
        return trimmed.replace(/\\/g, "/");
    }

    if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
        return trimmed;
    }

    return null;
}

function parseInline(text, options = {}) {
    let html = escapeHtml(text);

    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
        const cleanSrc = sanitizeUrl(src.split(/\s+/)[0], { allowLocalAsset: true });
        if (!cleanSrc) return escapeHtml(`![${alt}](${src})`);
        const resolvedSrc = options.resolveImageSrc ? options.resolveImageSrc(cleanSrc) : cleanSrc;
        return `<img src="${escapeAttribute(resolvedSrc)}" alt="${escapeAttribute(alt)}" loading="lazy" />`;
    });

    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        const cleanHref = sanitizeUrl(href.split(/\s+/)[0]);
        if (!cleanHref) return escapeHtml(`[${label}](${href})`);
        return `<a href="${escapeAttribute(cleanHref)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`;
    });

    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return html;
}

function wrapParagraph(lines, options) {
    const text = lines.join(" ").trim();
    if (!text) return "";
    return `<p>${parseInline(text, options)}</p>`;
}

export function renderMarkdown(markdown, options = {}) {
    const normalized = String(markdown || "").replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    const html = [];
    let paragraph = [];
    let inCodeBlock = false;
    let codeBuffer = [];
    let listType = null;
    let listItems = [];

    const flushParagraph = () => {
        const block = wrapParagraph(paragraph, options);
        if (block) html.push(block);
        paragraph = [];
    };

    const flushList = () => {
        if (!listType || listItems.length === 0) return;
        html.push(`<${listType}>${listItems.join("")}</${listType}>`);
        listType = null;
        listItems = [];
    };

    for (const rawLine of lines) {
        const line = rawLine ?? "";
        const trimmed = line.trim();

        if (trimmed.startsWith("```")) {
            flushParagraph();
            flushList();
            if (inCodeBlock) {
                html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
                codeBuffer = [];
            }
            inCodeBlock = !inCodeBlock;
            continue;
        }

        if (inCodeBlock) {
            codeBuffer.push(line);
            continue;
        }

        if (!trimmed) {
            flushParagraph();
            flushList();
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            flushParagraph();
            flushList();
            const level = headingMatch[1].length;
            html.push(`<h${level}>${parseInline(headingMatch[2], options)}</h${level}>`);
            continue;
        }

        const quoteMatch = trimmed.match(/^>\s?(.*)$/);
        if (quoteMatch) {
            flushParagraph();
            flushList();
            html.push(`<blockquote>${parseInline(quoteMatch[1], options)}</blockquote>`);
            continue;
        }

        const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
        if (unorderedMatch) {
            flushParagraph();
            if (listType !== "ul") flushList();
            listType = "ul";
            listItems.push(`<li>${parseInline(unorderedMatch[1], options)}</li>`);
            continue;
        }

        const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
        if (orderedMatch) {
            flushParagraph();
            if (listType !== "ol") flushList();
            listType = "ol";
            listItems.push(`<li>${parseInline(orderedMatch[1], options)}</li>`);
            continue;
        }

        paragraph.push(line);
    }

    flushParagraph();
    flushList();

    if (inCodeBlock) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
    }

    return html.join("");
}

export function stripMarkdown(markdown) {
    return String(markdown || "")
        .replace(/\r\n/g, "\n")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, " $1 ")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, " $1 ")
        .replace(/[`*_>#~-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function extractFirstImagePath(markdown) {
    const content = String(markdown || "");
    const match = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (!match) return null;

    const raw = match[1].trim().split(/\s+/)[0]?.trim();
    if (!raw) return null;

    return raw.replace(/^<|>$/g, "").replace(/\\/g, "/");
}
