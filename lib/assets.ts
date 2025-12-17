const CDN_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/$/, '');

function hasHttpPrefix(value: string) {
    return /^https?:\/\//i.test(value);
}

export function resolveImageUrl(primary?: string, fallback?: string) {
    const candidate = primary || fallback || '';
    if (!candidate) {
        return '';
    }
    if (hasHttpPrefix(candidate)) {
        return candidate;
    }
    if (candidate.startsWith('/')) {
        return candidate;
    }
    if (CDN_BASE) {
        return `${CDN_BASE}/${candidate.replace(/^\/+/, '')}`;
    }
    return `/${candidate.replace(/^\/+/, '')}`;
}

export function legacyCardImagePath(month: string, barcode: string) {
    return `/api/images/${month}/${barcode}/card`;
}

export function legacyCoverImagePath(month: string, barcode: string) {
    return `/api/images/${month}/${barcode}/cover`;
}

export function legacyCoverThumbnailPath(month: string, barcode: string) {
    return `/api/images/${month}/${barcode}/cover-thumbnail`;
}

export function legacyCardThumbnailPath(month: string, barcode: string) {
    // Check for subject ID format: YYYY-subject-NAME
    const subjectMatch = month.match(/^(\d{4})-subject-(.+)$/);
    if (subjectMatch) {
        const [_, year, name] = subjectMatch;
        return `/content/${year}/subject/${name}/${barcode}/${barcode}_thumb.jpg`;
    }

    // Check for sleeping beauty ID format: YYYY-sleeping-NAME
    const sleepingMatch = month.match(/^(\d{4})-sleeping-(.+)$/);
    if (sleepingMatch) {
        const [_, year, name] = sleepingMatch;
        return `/content/${year}/new/${name}/${barcode}/${barcode}_thumb.jpg`;
    }

    // Check for month ID format: YYYY-MM
    const monthMatch = month.match(/^(\d{4})-\d{2}$/);
    if (monthMatch) {
        const year = monthMatch[1];
        return `/content/${year}/${month}/${barcode}/${barcode}_thumb.jpg`;
    }

    return `/content/${month}/${barcode}/${barcode}_thumb.jpg`;
}
