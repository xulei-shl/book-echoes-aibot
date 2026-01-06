import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ month: string; id: string; type: string }> }
) {
    const { month, id, type } = await params;

    let baseDir = '';
    // Check for subject ID format: YYYY-subject-NAME
    const subjectMatch = month.match(/^(\d{4})-subject-(.+)$/);
    if (subjectMatch) {
        const [_, year, name] = subjectMatch;
        // Decode URI component for subject name in case it contains special chars
        baseDir = path.join(process.cwd(), 'public', 'content', year, 'subject', decodeURIComponent(name), id);
    } else {
        // Check for sleeping beauty ID format: YYYY-sleeping-NAME
        const sleepingMatch = month.match(/^(\d{4})-sleeping-(.+)$/);
        if (sleepingMatch) {
            const [_, year, name] = sleepingMatch;
            baseDir = path.join(process.cwd(), 'public', 'content', year, 'new', decodeURIComponent(name), id);
        } else {
            // Check for month ID format: YYYY-MM
            const monthMatch = month.match(/^(\d{4})-\d{2}$/);
            if (monthMatch) {
                const year = monthMatch[1];
                baseDir = path.join(process.cwd(), 'public', 'content', year, month, id);
            } else {
                // Fallback for old structure or unknown format
                baseDir = path.join(process.cwd(), 'public', 'content', month, id);
            }
        }
    }

    let filePath = '';
    let contentType = '';

    if (type === 'card' || type === 'thumbnail') {
        filePath = path.join(baseDir, `${id}.png`);
        contentType = 'image/png';
    } else if (type === 'cover') {
        filePath = path.join(baseDir, 'pic', 'cover.jpg');
        contentType = 'image/jpeg';
    } else if (type === 'cover-thumbnail') {
        filePath = path.join(baseDir, 'pic', 'cover_thumb.jpg');
        contentType = 'image/jpeg';
    } else {
        return new NextResponse('Invalid image type', { status: 400 });
    }

    try {
        const imageBuffer = await fs.promises.readFile(filePath);
        return new NextResponse(imageBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error(`Error serving image ${filePath}:`, error);
        return new NextResponse('Image not found', { status: 404 });
    }
}
