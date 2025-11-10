import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import styled from "styled-components";
import { fonts } from "@styles/fonts";

function dropNodeRef<T>(props: T): T {
  if (!props) return props;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { node, ref, ...rest } = props as Record<string, unknown>;
  return rest as T;
}

export default function MarkdownText({ children }: { children: string }) {
  const components: Components = {
    h1: (props: React.ComponentPropsWithoutRef<"h1">) => (
      <H1 {...dropNodeRef(props)} />
    ),
    h2: (props: React.ComponentPropsWithoutRef<"h2">) => (
      <H2 {...dropNodeRef(props)} />
    ),
    h3: (props: React.ComponentPropsWithoutRef<"h3">) => (
      <H3 {...dropNodeRef(props)} />
    ),
    p: (props: React.ComponentPropsWithoutRef<"p">) => (
      <P {...dropNodeRef(props)} />
    ),
    li: (props: React.ComponentPropsWithoutRef<"li">) => (
      <LI {...dropNodeRef(props)} />
    ),
    ul: (props: React.ComponentPropsWithoutRef<"ul">) => (
      <UL {...dropNodeRef(props)} />
    ),
    ol: (props: React.ComponentPropsWithoutRef<"ol">) => (
      <OL {...dropNodeRef(props)} />
    ),
    code: ({
      inline,
      className,
      children,
    }: {
      inline?: boolean;
      className?: string;
      children?: React.ReactNode;
    }) =>
      inline ? (
        <CodeInline className={className}>{children}</CodeInline>
      ) : (
        <CodeBlock className={className}>{children}</CodeBlock>
      ),
  };

  return (
    <Root>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </Root>
  );
}

/* ---- styles ---- */
const Root = styled.div`
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.base.black};
  word-break: break-word;
  white-space: normal;
  ${fonts.regular20}
`;
const P = styled.p`
  ${fonts.regular20}
`;
const H1 = styled.h1`
  ${fonts.medium26}
`;
const H2 = styled.h2`
  font-size: 1.25rem;
  margin: 0.6rem 0;
  ${fonts.medium26}
`;
const H3 = styled.h3`
  font-size: 1.1rem;
  margin: 0.6rem 0;
  ${fonts.medium26}
`;
const UL = styled.ul`
  padding-left: 1.25rem;
  ${fonts.regular20}
  margin: 0.4rem 0;
`;
const OL = styled.ol`
  padding-left: 1.25rem;
  margin: 0.4rem 0;
  ${fonts.regular20}
`;
const LI = styled.li`
  margin: 0.2rem 0;
  ${fonts.regular20}
`;
const CodeInline = styled.code`
  padding: 0 4px;
  border-radius: 4px;
  background: #f3f4f6;
  ${fonts.regular20}
`;
const CodeBlock = styled.pre`
  padding: 10px;
  border-radius: 8px;
  background: #f3f4f6;
  overflow: auto;
  ${fonts.regular20}
`;
