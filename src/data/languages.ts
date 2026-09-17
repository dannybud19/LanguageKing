/**
 * Flashcard content, extracted from App.tsx so the lexicon build script can
 * read it without importing React.
 *
 * `scripts/build-lexicon.mts` phonemises every `word` and `example` here into
 * the reference pronunciations the recogniser scores against, so adding a card
 * extends what the app can recognise -- rerun `npm run build:lexicon`.
 */

export interface Flashcard {
  id: string
  word: string
  phonetic: string
  translation: string
  category: string
  example: string
  exampleTranslation: string
  level: string
}

export interface LanguageData {
  id: string
  name: string
  flag: string
  cards: Flashcard[]
}

export const LANGUAGES: LanguageData[] = [
  {
    id: 'es',
    name: 'Spanish',
    flag: '🇪🇸',
    cards: [
      {
        id: 'es-1',
        word: 'Mariposa',
        phonetic: '/ma.ɾiˈpo.sa/',
        translation: 'Butterfly',
        category: 'Nature',
        example: 'La mariposa vuela entre las flores del jardín.',
        exampleTranslation: 'The butterfly flies among the garden flowers.',
        level: 'A1 Beginner',
      },
      {
        id: 'es-2',
        word: 'Sobremesa',
        phonetic: '/so.βɾeˈme.sa/',
        translation: 'After-dinner conversation',
        category: 'Culture',
        example: 'Disfrutamos de una larga sobremesa con amigos.',
        exampleTranslation: 'We enjoyed a long post-meal conversation with friends.',
        level: 'B1 Intermediate',
      },
      {
        id: 'es-3',
        word: 'Deslumbrante',
        phonetic: '/dez.lumˈbɾan.te/',
        translation: 'Dazzling / Stunning',
        category: 'Adjective',
        example: 'La vista desde el castillo era deslumbrante.',
        exampleTranslation: 'The view from the castle was dazzling.',
        level: 'B2 Advanced',
      },
    ],
  },
  {
    id: 'ja',
    name: 'Japanese',
    flag: '🇯🇵',
    cards: [
      {
        id: 'ja-1',
        word: '木漏れ日 (Komorebi)',
        phonetic: 'ko-mo-re-bi',
        translation: 'Sunlight filtering through trees',
        category: 'Nature & Aesthetics',
        example: '森の中の木漏れ日がとても美しかった。',
        exampleTranslation: 'The sunlight filtering through the forest was beautiful.',
        level: 'N3 Intermediate',
      },
      {
        id: 'ja-2',
        word: '一期一会 (Ichigo Ichie)',
        phonetic: 'i-chi-go i-chi-e',
        translation: 'Once-in-a-lifetime encounter',
        category: 'Philosophy',
        example: '今日という日を一期一会の気持ちで大切にする。',
        exampleTranslation: 'Cherish today with the spirit of a unique encounter.',
        level: 'N2 Pro',
      },
      {
        id: 'ja-3',
        word: '乾杯 (Kanpai)',
        phonetic: 'kan-pai',
        translation: 'Cheers! / Empty the cup',
        category: 'Social',
        example: '友情を祝って、みんなで乾杯しましょう！',
        exampleTranslation: 'Let us cheer together to celebrate friendship!',
        level: 'N5 Beginner',
      },
    ],
  },
  {
    id: 'fr',
    name: 'French',
    flag: '🇫🇷',
    cards: [
      {
        id: 'fr-1',
        word: 'Étoile',
        phonetic: '/e.twal/',
        translation: 'Star',
        category: 'Cosmos',
        example: 'Le ciel de nuit brillait de mille étoiles.',
        exampleTranslation: 'The night sky sparkled with a thousand stars.',
        level: 'A1 Beginner',
      },
      {
        id: 'fr-2',
        word: 'Flâneur',
        phonetic: '/fla.nœʁ/',
        translation: 'Aimless passionate city wanderer',
        category: 'Culture',
        example: 'Il adore être un flâneur dans les ruelles de Paris.',
        exampleTranslation: 'He loves strolling aimlessly through the alleys of Paris.',
        level: 'B2 Advanced',
      },
      {
        id: 'fr-3',
        word: 'Déjà-vu',
        phonetic: '/de.ʒa.vy/',
        translation: 'Already seen',
        category: 'Psychology',
        example: 'J’ai eu une impression étrange de déjà-vu.',
        exampleTranslation: 'I had a strange sensation of having seen it before.',
        level: 'A2 Elementary',
      },
    ],
  },
  {
    id: 'de',
    name: 'German',
    flag: '🇩🇪',
    cards: [
      {
        id: 'de-1',
        word: 'Fernweh',
        phonetic: '/ˈfɛʁnˌveː/',
        translation: 'Longing for far-off places (wanderlust)',
        category: 'Emotion',
        example: 'Im Frühling packt mich immer das Fernweh.',
        exampleTranslation: 'In spring, I am always seized by a desire to travel.',
        level: 'B1 Intermediate',
      },
      {
        id: 'de-2',
        word: 'Wunderkind',
        phonetic: '/ˈvʊndɐˌkɪnt/',
        translation: 'Prodigy / Wonder child',
        category: 'Society',
        example: 'Mozart galt als das größte Wunderkind seiner Zeit.',
        exampleTranslation: 'Mozart was considered the greatest prodigy of his time.',
        level: 'A2 Elementary',
      },
      {
        id: 'de-3',
        word: 'Gemütlichkeit',
        phonetic: '/ɡəˈmyːtlɪçkaɪt/',
        translation: 'Cozy warmth and good cheer',
        category: 'Lifestyle',
        example: 'Das Café strahlt eine warme Gemütlichkeit aus.',
        exampleTranslation: 'The coffee house radiates cozy warmth.',
        level: 'B2 Advanced',
      },
    ],
  },
  {
    id: 'it',
    name: 'Italian',
    flag: '🇮🇹',
    cards: [
      {
        id: 'it-1',
        word: 'Aperitivo',
        phonetic: '/apeɾiˈtivo/',
        translation: 'Pre-meal drink with appetizers',
        category: 'Culinary',
        example: 'Incontriamoci in piazza per un delizioso aperitivo.',
        exampleTranslation: 'Let us meet in the square for an aperitivo.',
        level: 'A1 Beginner',
      },
      {
        id: 'it-2',
        word: 'Mozzafiato',
        phonetic: '/mottsaˈfjato/',
        translation: 'Breathtaking',
        category: 'Expression',
        example: 'Il tramonto sulla costiera era semplicemente mozzafiato.',
        exampleTranslation: 'The sunset over the coast was simply breathtaking.',
        level: 'B1 Intermediate',
      },
      {
        id: 'it-3',
        word: 'Dolce far niente',
        phonetic: '/ˈdoltʃe far ˈnjɛnte/',
        translation: 'The sweetness of doing nothing',
        category: 'Philosophy',
        example: 'Durante le vacanze celebriamo il dolce far niente.',
        exampleTranslation: 'During vacation we celebrate the sweet idle life.',
        level: 'B2 Advanced',
      },
    ],
  },
]
