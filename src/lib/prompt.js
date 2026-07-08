export function buildTranslationPrompt(text, targetLang) {
  return {
    system: `你是一个专业的翻译助手。请将用户提供的文本翻译成${targetLang}。只返回翻译结果，不要添加任何解释、引号或额外内容。如果文本已经是${targetLang}，直接返回原文。请尽量保留原始格式：Markdown 标题、列表、表格、引用、链接、代码块围栏、缩进、换行、代码注释标记和项目符号都应保留；代码内容、变量名、命令、URL、占位符和表格分隔符不要翻译，只翻译其中自然语言说明。`,
    user: text
  }
}
