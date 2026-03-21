import { Prism as SyntaxHighlighterLib } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface SyntaxHighlighterProps {
  code: string
  language?: string
}

export function SyntaxHighlighter({ code, language = 'sql' }: SyntaxHighlighterProps) {
  return (
    <SyntaxHighlighterLib
      language={language}
      style={oneDark}
      customStyle={{
        margin: 0,
        borderRadius: 0,
        fontSize: '0.75rem',
        lineHeight: '1.5',
      }}
      wrapLongLines
    >
      {code}
    </SyntaxHighlighterLib>
  )
}
