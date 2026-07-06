import { buildTranslationPrompt } from './prompt.js'

export async function translate(text, config) {
  const { baseUrl, apiKey, model, targetLang } = config

  if (!baseUrl || !model) {
    throw new Error('请完成 API 配置')
  }

  const prompts = buildTranslationPrompt(text, targetLang)
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user }
      ],
      temperature: 0.3,
      max_tokens: 4096
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 请求失败 (${response.status}): ${err}`)
  }

  const data = await response.json()
  return data.choices[0].message.content.trim()
}
