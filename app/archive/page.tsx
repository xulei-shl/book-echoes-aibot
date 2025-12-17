import { getArchiveData, getAboutContent } from '@/lib/content';
import Header from '@/components/Header';
import ArchiveContent from '@/components/ArchiveContent';

export const metadata = {
    title: '往期回顾 | 书海回响',
    description: '书海回响往期期刊归档',
};

export default async function ArchivePage() {
    const archiveData = await getArchiveData();
    const aboutContent = await getAboutContent();

    const existingYears = archiveData.map(data => data.year);
    const futureYears = ['2028', '2027', '2026'];
    const years = Array.from(new Set([...futureYears, ...existingYears])).sort((a, b) => b.localeCompare(a));

    return (
        <main className="relative min-h-screen bg-[#1a1a1a] overflow-hidden">
            <Header showHomeButton={true} aboutContent={aboutContent} theme="dark" />

            {/* Background Grid System */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                {/* Main Grid */}
                <div className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            linear-gradient(to right, rgba(201, 160, 99, 0.08) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(201, 160, 99, 0.08) 1px, transparent 1px)
                        `,
                        backgroundSize: '60px 60px'
                    }}
                />

                {/* Secondary/Major Grid (every 5 cells) */}
                <div className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            linear-gradient(to right, rgba(201, 160, 99, 0.12) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(201, 160, 99, 0.12) 1px, transparent 1px)
                        `,
                        backgroundSize: '300px 300px'
                    }}
                />
            </div>

            <ArchiveContent years={years} archiveData={archiveData} />
        </main>
    );
}
