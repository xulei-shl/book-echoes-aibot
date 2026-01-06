'use client';

import { ReactNode, useState } from 'react';
import ArchiveYearNav from './ArchiveYearNav';

interface ArchiveLayoutProps {
    years: string[];
    children: ReactNode;
}

export default function ArchiveLayout({ years, children }: ArchiveLayoutProps) {
    const [activeYear, setActiveYear] = useState(years[0] || '');

    return (
        <div className="relative min-h-screen bg-[#1a1a1a] overflow-hidden">
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

            {/* Main Content */}
            <div className="relative z-10 pt-32 pb-20 px-4 md:px-8">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
                    {/* Left Sidebar - Year Navigation */}
                    <aside className="md:col-span-2 hidden md:block sticky top-32 h-fit">
                        <ArchiveYearNav
                            years={years}
                            activeYear={activeYear}
                            onYearSelect={setActiveYear}
                        />
                    </aside>

                    {/* Right Content - Cover Grid */}
                    <main className="md:col-span-10">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
