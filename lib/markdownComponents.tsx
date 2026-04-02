import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';

export const markdownComponents: Components = {
    h1: (props) => (
        <h1
            className="font-accent text-4xl md:text-5xl text-[#D4A574] tracking-wide mb-8 border-b border-[#D4A574]/30 pb-4"
            {...props}
        />
    ),
    h2: (props) => (
        <h2
            className="font-accent text-3xl md:text-4xl text-[#C9A063] mt-10 mb-4 flex items-center gap-3"
            {...props}
        >
            <span className="w-1.5 h-1.5 bg-[#C9A063] rounded-sm" />
            {props.children}
        </h2>
    ),
    h3: (props) => (
        <h3
            className="font-accent text-2xl md:text-3xl text-[#B8956A] mt-8 mb-3 tracking-wide"
            {...props}
        />
    ),
    h4: (props) => (
        <h4
            className="font-accent text-2xl md:text-3xl text-[#E8D4B0] mt-6 mb-2 tracking-wide font-semibold"
            {...props}
        />
    ),
    h5: (props) => (
        <h5
            className="font-accent text-sm text-[#D4C5A0] mt-4 mb-2 tracking-wide font-semibold"
            {...props}
        />
    ),
    h6: (props) => (
        <h6
            className="font-accent text-xs text-[#C9B890] mt-3 mb-2 tracking-wide font-semibold uppercase"
            {...props}
        />
    ),
    p: (props) => (
        <p
            className="font-accent text-xl leading-relaxed text-[#D4D4D4] mb-6 whitespace-pre-wrap tracking-normal text-justify"
            {...props}
        />
    ),
    ul: (props) => (
        <ul className="list-none space-y-2 text-[#D4D4D4] mb-6 tracking-normal" {...props} />
    ),
    ol: (props) => (
        <ol className="list-decimal list-inside space-y-2 text-[#D4D4D4] mb-6 tracking-normal" {...props} />
    ),
    li: (props) => (
        <li className="font-info-content text-base leading-relaxed flex gap-3" {...props}>
            <span className="text-[#7B9DAE] mt-1 text-xs">◆</span>
            <span>{props.children}</span>
        </li>
    ),
    hr: () => <div className="my-10 border-t border-[#D4A574]/30" />,
    strong: (props) => (
        <strong className="text-[#C9A063] font-semibold" {...props} />
    ),
    em: (props) => (
        <em className="text-[#B8C5D0] italic font-info-content" {...props} />
    ),
    blockquote: (props) => (
        <blockquote
            className="border-l-2 border-[#7B9DAE] pl-6 italic text-[#B8C5D0] my-8 tracking-normal bg-[#7B9DAE]/5 py-4 pr-4 font-info-content"
            {...props}
        />
    ),
    table: (props) => (
        <div className="overflow-x-auto border border-[#D4A574]/30 my-8 bg-[#1a1a1a]">
            <table className="min-w-full divide-y divide-[#D4A574]/30" {...props} />
        </div>
    ),
    thead: (props) => (
        <thead className="bg-[#D4A574]/10 text-[#D4A574] uppercase text-xs tracking-widest font-mono" {...props} />
    ),
    tbody: (props) => <tbody className="divide-y divide-[#D4A574]/10" {...props} />,
    th: (props) => (
        <th className="px-4 py-3 text-left font-medium text-sm" {...props} />
    ),
    td: (props) => (
        <td className="px-4 py-3 text-sm text-[#D4D4D4] align-top tracking-normal font-info-content" {...props} />
    ),
    code: ({ inline, className, children, ...props }: any) => {
        if (inline) {
            return (
                <code
                    className={clsx(
                        'font-mono text-sm px-1.5 py-0.5 rounded bg-[#7B9DAE]/10 text-[#7B9DAE]',
                        className
                    )}
                    {...props}
                >
                    {children}
                </code>
            );
        }

        return (
            <pre className={clsx('bg-[#000000]/30 border border-[#7B9DAE]/30 p-4 overflow-x-auto text-sm text-[#D4D4D4] my-6 tracking-normal font-mono', className)}>
                <code {...props}>{children}</code>
            </pre>
        );
    }
};

// MessageStream专用的轻量级markdown组件（针对消息气泡）
export const messageMarkdownComponents: Components = {
    h1: (props) => (
        <h1 className="text-xl font-semibold text-[#D4A574] mb-3 border-b border-[#D4A574]/30 pb-2" {...props} />
    ),
    h2: (props) => (
        <h2 className="text-lg font-semibold text-[#C9A063] mt-4 mb-2 flex items-center gap-2" {...props}>
            <span className="w-1 h-1 bg-[#C9A063] rounded-sm" />
            {props.children}
        </h2>
    ),
    h3: (props) => (
        <h3 className="text-base font-semibold text-[#B8956A] mt-3 mb-2" {...props} />
    ),
    h4: (props) => (
        <h4 className="text-base font-semibold text-[#E8D4B0] mt-3 mb-2" {...props} />
    ),
    h5: (props) => (
        <h5 className="text-sm font-semibold text-[#D4C5A0] mt-2 mb-1" {...props} />
    ),
    h6: (props) => (
        <h6 className="text-xs font-semibold text-[#C9B890] mt-2 mb-1 uppercase" {...props} />
    ),
    p: (props) => (
        <p className="text-sm leading-relaxed text-[#E8E6DC] mb-3 whitespace-pre-wrap" {...props} />
    ),
    ul: (props) => (
        <ul className="list-none space-y-1 text-[#E8E6DC] mb-3" {...props} />
    ),
    ol: (props) => (
        <ol className="list-decimal list-inside space-y-1 text-[#E8E6DC] mb-3" {...props} />
    ),
    li: (props) => (
        <li className="text-sm leading-relaxed flex gap-2" {...props}>
            <span className="text-[#7B9DAE] mt-1 text-xs">•</span>
            <span>{props.children}</span>
        </li>
    ),
    hr: () => <div className="my-4 border-t border-[#C9A063]/30" />,
    strong: (props) => (
        <strong className="text-[#C9A063] font-semibold" {...props} />
    ),
    em: (props) => (
        <em className="text-[#B8C5D0] italic" {...props} />
    ),
    blockquote: (props) => (
        <blockquote
            className="border-l-2 border-[#7B9DAE] pl-4 italic text-[#B8C5D0] my-3 bg-[#7B9DAE]/5 py-2 pr-2 text-sm"
            {...props}
        />
    ),
    table: (props) => (
        <div className="overflow-x-auto border border-[#C9A063]/30 my-3 bg-[#1B1B1B]">
            <table className="min-w-full divide-y divide-[#C9A063]/30" {...props} />
        </div>
    ),
    thead: (props) => (
        <thead className="bg-[#C9A063]/10 text-[#C9A063] uppercase text-xs tracking-widest font-mono" {...props} />
    ),
    tbody: (props) => <tbody className="divide-y divide-[#C9A063]/10" {...props} />,
    th: (props) => (
        <th className="px-3 py-2 text-left font-medium text-sm" {...props} />
    ),
    td: (props) => (
        <td className="px-3 py-2 text-sm text-[#E8E6DC] align-top tracking-normal" {...props} />
    ),
    code: ({ inline, className, children, ...props }: any) => {
        if (inline) {
            return (
                <code
                    className={clsx(
                        'font-mono text-xs px-1 py-0.5 rounded bg-[#7B9DAE]/10 text-[#7B9DAE]',
                        className
                    )}
                    {...props}
                >
                    {children}
                </code>
            );
        }

        return (
            <pre className={clsx('bg-[#000000]/30 border border-[#7B9DAE]/30 p-3 overflow-x-auto text-xs text-[#E8E6DC] my-3 tracking-normal font-mono', className)}>
                <code {...props}>{children}</code>
            </pre>
        );
    }
};