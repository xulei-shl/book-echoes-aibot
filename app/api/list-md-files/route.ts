import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const type = searchParams.get('type') || 'subject';
    const subject = searchParams.get('subject');

    if (!year || !subject) {
        return Response.json({ error: 'Missing year or subject parameter' }, { status: 400 });
    }

    if (type !== 'subject' && type !== 'literature') {
        return Response.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
    
    try {
        const subjectDir = path.join(process.cwd(), 'public', 'content', year, type, subject);
        
        // 检查目录是否存在
        try {
            await fs.access(subjectDir);
        } catch (accessError) {
            return Response.json({ error: 'Directory not found' }, { status: 404 });
        }
        
        const files = await fs.readdir(subjectDir);
        
        const mdFiles = files.filter(file => file.endsWith('.md'));
        
        return Response.json(mdFiles);
    } catch (error) {
        console.error('[SubjectAPI] 列出MD文件失败', error);
        return Response.json({ error: 'Failed to list files' }, { status: 500 });
    }
}
