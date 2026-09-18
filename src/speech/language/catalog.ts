/**
 * Every language the app can name, whether or not it has a phoneme profile.
 *
 * Gemma hears the audio and can name far more languages than the six that
 * `inventory.ts` has hand-built phoneme profiles for. Without this table a
 * correct "Portuguese" from the model would have nowhere to go: no flag, no
 * speech-synthesis tag, and -- the part that matters -- no Whisper language
 * name to force the transcript to.
 *
 * Entries here without a profile simply have empty phoneme lists, so the
 * inventory scorer never votes for them. They can win only on Gemma's word.
 */

import { PROFILE_BY_CODE, type LanguageProfile } from './inventory'

type Entry = Pick<LanguageProfile, 'code' | 'name' | 'flag' | 'tag' | 'whisperName'>

/** Only languages Whisper large-v3 can be forced to. */
const EXTRA: Entry[] = [
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹', tag: 'pt-PT', whisperName: 'portuguese' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷', tag: 'ko-KR', whisperName: 'korean' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', tag: 'zh-CN', whisperName: 'chinese' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱', tag: 'nl-NL', whisperName: 'dutch' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺', tag: 'ru-RU', whisperName: 'russian' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱', tag: 'pl-PL', whisperName: 'polish' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪', tag: 'sv-SE', whisperName: 'swedish' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷', tag: 'tr-TR', whisperName: 'turkish' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦', tag: 'ar-SA', whisperName: 'arabic' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳', tag: 'hi-IN', whisperName: 'hindi' },
  { code: 'el', name: 'Greek', flag: '🇬🇷', tag: 'el-GR', whisperName: 'greek' },
  { code: 'ca', name: 'Catalan', flag: '🏴', tag: 'ca-ES', whisperName: 'catalan' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩', tag: 'id-ID', whisperName: 'indonesian' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳', tag: 'vi-VN', whisperName: 'vietnamese' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦', tag: 'uk-UA', whisperName: 'ukrainian' },
]

const toProfile = (e: Entry): LanguageProfile => ({ ...e, markers: [], common: [], foreign: [] })

export const CATALOG: LanguageProfile[] = [
  ...PROFILE_BY_CODE.values(),
  ...EXTRA.filter((e) => !PROFILE_BY_CODE.has(e.code)).map(toProfile),
]

const BY_CODE = new Map(CATALOG.map((p) => [p.code, p]))

/** Alternative names a model may answer with, lower-cased. */
const ALIASES: Record<string, string> = {
  mandarin: 'zh',
  castilian: 'es',
  deutsch: 'de',
  español: 'es',
  français: 'fr',
  italiano: 'it',
  português: 'pt',
  日本語: 'ja',
  한국어: 'ko',
  中文: 'zh',
}

export function profileForCode(code: string): LanguageProfile | null {
  return BY_CODE.get(code) ?? null
}

/** Resolve a full language name ("Spanish", "spanish.", "Deutsch") to a profile. */
export function profileForName(name: string): LanguageProfile | null {
  const key = name.trim().toLowerCase().replace(/[^\p{L}]/gu, '')
  if (!key) return null
  const aliased = ALIASES[key]
  if (aliased) return BY_CODE.get(aliased) ?? null
  return CATALOG.find((p) => p.name.toLowerCase() === key) ?? null
}

/**
 * Resolve a partial name to a profile, for the first token of an answer.
 *
 * Tokenisers split rarer names -- "Catal" + "an" -- so a top-k list of first
 * tokens holds fragments as often as whole words. A fragment counts only if it
 * is unambiguous: "Port" is Portuguese, but "I" could be several languages and
 * is dropped rather than guessed.
 */
export function profileForPrefix(fragment: string): LanguageProfile | null {
  const whole = profileForName(fragment)
  if (whole) return whole
  const key = fragment.trim().toLowerCase().replace(/[^\p{L}]/gu, '')
  if (key.length < 3) return null
  const hits = CATALOG.filter((p) => p.name.toLowerCase().startsWith(key))
  return hits.length === 1 ? hits[0] : null
}
