export function buildTranslationPrompt(text, targetLang) {
  return {
    system: `你是一个专业的翻译助手。请将用户提供的文本翻译成${targetLang}。只返回翻译结果，不要添加任何解释、引号或额外内容。如果文本已经是${targetLang}，直接返回原文。**注意**：如果用户提供的文本中包含换行的格式，在翻译的结果中也一并把格式带上。`,
    user: text
  }
}
