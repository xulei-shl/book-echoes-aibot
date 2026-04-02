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
        <h1 className="font-accent text-[1.45rem] leading-tight text-[#E8D7BB] mb-4 border-b border-[#C9A063]/18 pb-3 tracking-[0.01em]" {...props} />
    ),
    h2: (props) => (
        <h2 className="font-accent text-[1.15rem] leading-snug text-[#DDBA81] mt-5 mb-3 flex items-center gap-2.5" {...props}>
            <span className="w-1.5 h-1.5 bg-[#C9A063] rounded-full shadow-[0_0_10px_rgba(201,160,99,0.35)]" />
            {props.children}
        </h2>
    ),
    h3: (props) => (
        <h3 className="font-info-content text-base font-semibold text-[#E7DECF] mt-4 mb-2" {...props} />
    ),
    h4: (props) => (
        <h4 className="font-info-content text-sm font-semibold uppercase tracking-[0.08em] text-[#C9A063] mt-4 mb-2" {...props} />
    ),
    h5: (props) => (
        <h5 className="font-info-content text-sm font-medium text-[#D6CCBC] mt-3 mb-1.5" {...props} />
    ),
    h6: (props) => (
        <h6 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#9F978A] mt-3 mb-1.5" {...props} />
    ),
    p: (props) => (
        <p className="font-info-content text-[0.96rem] leading-7 text-[#E8E2D5] mb-3 whitespace-pre-wrap" {...props} />
    ),
    ul: (props) => (
        <ul className="list-none space-y-2 text-[#E8E2D5] mb-4" {...props} />
    ),
    ol: (props) => (
        <ol className="list-decimal list-inside space-y-2 text-[#E8E2D5] mb-4" {...props} />
    ),
    li: (props) => (
        <li className="font-info-content text-sm leading-7 flex gap-2.5" {...props}>
            <span className="text-[#C9A063] mt-[0.45rem] text-[10px]">•</span>
            <span>{props.children}</span>
        </li>
    ),
    hr: () => <div className="my-5 border-t border-[#C9A063]/16" />,
    strong: (props) => (
        <strong className="text-[#F0DEC0] font-semibold" {...props} />
    ),
    em: (props) => (
        <em className="text-[#BFC9D2] italic" {...props} />
    ),
    blockquote: (props) => (
        <blockquote
            className="border-l-2 border-[#C9A063]/35 pl-4 italic text-[#C9C1B3] my-4 bg-[#C9A063]/5 py-2 pr-2 text-sm rounded-r-xl"
            {...props}
        />
    ),
    table: (props) => (
        <div className="aibot-scroll overflow-x-auto border border-[#C9A063]/16 my-4 rounded-2xl bg-[#13110F]">
            <table className="min-w-full divide-y divide-[#C9A063]/14" {...props} />
        </div>
    ),
    thead: (props) => (
        <thead className="bg-[#C9A063]/8 text-[#C9A063] uppercase text-[11px] tracking-[0.18em] font-mono" {...props} />
    ),
    tbody: (props) => <tbody className="divide-y divide-[#C9A063]/10" {...props} />,
    th: (props) => (
        <th className="px-3 py-2.5 text-left font-medium text-sm" {...props} />
    ),
    td: (props) => (
        <td className="px-3 py-2.5 text-sm text-[#E8E2D5] align-top tracking-normal font-info-content" {...props} />
    ),
    code: ({ inline, className, children, ...props }: any) => {
        if (inline) {
            return (
                <code
                    className={clsx(
                        'font-mono text-xs px-1.5 py-0.5 rounded-md bg-[#7B9DAE]/10 text-[#A7C0CF]',
                        className
                    )}
                    {...props}
                >
                    {children}
                </code>
            );
        }

        return (
            <pre className={clsx('aibot-scroll bg-[#0F0E0C] border border-[#7B9DAE]/20 p-3.5 overflow-x-auto text-xs text-[#E8E6DC] my-4 tracking-normal font-mono rounded-2xl', className)}>
                <code {...props}>{children}</code>
            </pre>
        );
    }
};
