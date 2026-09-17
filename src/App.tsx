import { useState } from 'react'
import './App.css'

interface Flashcard {
  id: string
  word: string
  phonetic: string
  translation: string
  category: string
  example: string
  exampleTranslation: string
  level: string
}

interface LanguageData {
  id: string
  name: string
  flag: string
  cards: Flashcard[]
}

const LANGUAGES: LanguageData[] = [
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

export function App() {
  const [selectedLangId, setSelectedLangId] = useState<string>('es')
  const [cardIndex, setCardIndex] = useState<number>(0)
  const [isFlipped, setIsFlipped] = useState<boolean>(false)
  const [masteredCount, setMasteredCount] = useState<number>(14)
  const [streakCount, setStreakCount] = useState<number>(7)
  const [practiceSessions, setPracticeSessions] = useState<number>(38)
  const [recentlyLearned, setRecentlyLearned] = useState<string | null>(null)

  const currentLanguage =
    LANGUAGES.find((lang) => lang.id === selectedLangId) || LANGUAGES[0]
  const currentCard = currentLanguage.cards[cardIndex] || currentLanguage.cards[0]

  const handleLanguageChange = (langId: string) => {
    setSelectedLangId(langId)
    setCardIndex(0)
    setIsFlipped(false)
  }

  const handleNextCard = () => {
    setIsFlipped(false)
    setCardIndex((prev) => (prev + 1) % currentLanguage.cards.length)
    setPracticeSessions((prev) => prev + 1)
  }

  const handlePrevCard = () => {
    setIsFlipped(false)
    setCardIndex((prev) =>
      prev === 0 ? currentLanguage.cards.length - 1 : prev - 1
    )
  }

  const handleFlipCard = () => {
    setIsFlipped(!isFlipped)
  }

  const handleMarkMastered = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMasteredCount((prev) => prev + 1)
    setStreakCount((prev) => prev + 1)
    setRecentlyLearned(currentCard.word)
    setTimeout(() => setRecentlyLearned(null), 3000)
    handleNextCard()
  }

  return (
    <div className="app-container">
      {/* App Header & Navbar */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">
            👑
          </div>
          <div>
            <span className="brand-title">LanguageKing</span>
          </div>
          <span className="brand-badge">React 19 + Vite</span>
        </div>

        <div className="header-actions">
          <div
            className="streak-pill"
            id="streak-indicator"
            title="Your continuous daily learning streak"
          >
            <span className="streak-flame">🔥</span>
            <span>{streakCount} Day Streak</span>
          </div>

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
            id="header-repo-link"
          >
            <span>GitHub</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-pill">
            <span>⚡ Next-Generation React Frontend</span>
            <span>•</span>
            <span>Fast, Modular & Interactive</span>
          </div>

          <h1 className="hero-title">
            Rule Your Vocabulary with{' '}
            <span className="gradient-text">Royal Mastery</span>
          </h1>

          <p className="hero-description">
            Welcome to the newly initialized React frontend for LanguageKing.
            Explore interactive flashcards, track streaks in real time, and
            experience instantaneous Vite-powered development.
          </p>

          {/* Language Selector */}
          <div className="language-selector-wrap">
            <span className="selector-label">Choose Practice Language</span>
            <div className="language-tabs" role="tablist" aria-label="Languages">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  id={`lang-tab-${lang.id}`}
                  type="button"
                  role="tab"
                  aria-selected={lang.id === selectedLangId}
                  className={`lang-tab-btn ${
                    lang.id === selectedLangId ? 'active' : ''
                  }`}
                  onClick={() => handleLanguageChange(lang.id)}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Flashcard Practice Arena */}
          <div className="practice-stage">
            <div className="card-header-bar">
              <span>
                Card {cardIndex + 1} of {currentLanguage.cards.length}
              </span>
              <span>
                {recentlyLearned ? (
                  <strong style={{ color: 'var(--accent-emerald)' }}>
                    ✓ Mastered {recentlyLearned}!
                  </strong>
                ) : (
                  'Click card or button to reveal'
                )}
              </span>
            </div>

            <div
              id="practice-flashcard"
              className={`card-flip-container ${isFlipped ? 'flipped' : ''}`}
              onClick={handleFlipCard}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleFlipCard()
                }
              }}
              aria-label={`Flashcard: ${currentCard.word}. Press enter to flip`}
            >
              {/* Card Front */}
              <div className="card-face card-front">
                <div className="card-top-tag">
                  <span className="difficulty-badge">{currentCard.level}</span>
                  <span className="flip-hint">🔄 Click to Flip</span>
                </div>

                <div className="word-display">
                  <h2 className="primary-word">{currentCard.word}</h2>
                  <p className="phonetic">{currentCard.phonetic}</p>
                </div>

                <div className="card-bottom-info">
                  <span>Category: {currentCard.category}</span>
                  <span>{currentLanguage.name} {currentLanguage.flag}</span>
                </div>
              </div>

              {/* Card Back */}
              <div className="card-face card-back">
                <div className="card-top-tag">
                  <span className="difficulty-badge">{currentCard.category}</span>
                  <span className="flip-hint">🔄 Click to Flip Back</span>
                </div>

                <div className="word-display">
                  <h2 className="primary-word" style={{ color: 'var(--accent-gold)' }}>
                    {currentCard.translation}
                  </h2>
                  <div className="example-sentence">
                    <p><strong>Example:</strong> “{currentCard.example}”</p>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                      “{currentCard.exampleTranslation}”
                    </p>
                  </div>
                </div>

                <div className="card-bottom-info">
                  <span>Pronunciation: {currentCard.phonetic}</span>
                  <span style={{ color: 'var(--accent-purple)' }}>Ready for recall</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="card-controls">
              <button
                id="btn-prev-card"
                type="button"
                className="btn btn-secondary"
                onClick={handlePrevCard}
              >
                ← Previous
              </button>

              <button
                id="btn-flip-card"
                type="button"
                className="btn btn-primary"
                onClick={handleFlipCard}
              >
                {isFlipped ? 'Show Prompt' : 'Reveal Meaning'}
              </button>

              <button
                id="btn-master-card"
                type="button"
                className="btn btn-success"
                onClick={handleMarkMastered}
                title="Mark word as mastered and advance"
              >
                ✓ I Know This (+1)
              </button>

              <button
                id="btn-next-card"
                type="button"
                className="btn btn-secondary"
                onClick={handleNextCard}
              >
                Next →
              </button>
            </div>
          </div>

          {/* Real-time Metrics Grid */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon-box">🏆</div>
              <div>
                <div className="metric-value">{masteredCount}</div>
                <div className="metric-title">Words Mastered</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-box">⚡</div>
              <div>
                <div className="metric-value">{practiceSessions}</div>
                <div className="metric-title">Practice Repetitions</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-box">🌐</div>
              <div>
                <div className="metric-value">{LANGUAGES.length}</div>
                <div className="metric-title">Active Languages</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-box">🚀</div>
              <div>
                <div className="metric-value">100%</div>
                <div className="metric-title">Vite Build Efficiency</div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights Section */}
        <section className="features-section" aria-labelledby="features-heading">
          <div className="section-header">
            <h2 id="features-heading" className="section-title">
              Engineered for Modern Language Mastery
            </h2>
            <p className="section-subtitle">
              Built on React with zero extra bloat, clean modular structure, and instant reactivity.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-emoji">⚡</div>
              <h3 className="feature-heading">Sub-Millisecond HMR</h3>
              <p className="feature-text">
                Powered by Vite 6 and React 19 for instantaneous hot module
                replacement and blistering-fast build speeds.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-emoji">🧠</div>
              <h3 className="feature-heading">Spaced Repetition Ready</h3>
              <p className="feature-text">
                Architecture designed for easy integration with Leitner algorithms,
                Anki-style decks, or AI-powered speech analysis.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-emoji">🎨</div>
              <h3 className="feature-heading">Pure Vanilla CSS</h3>
              <p className="feature-text">
                Zero bloated runtime utility overhead. Clean CSS custom properties,
                responsive glassmorphism, and hardware-accelerated 3D transforms.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-emoji">🔒</div>
              <h3 className="feature-heading">Strict TypeScript</h3>
              <p className="feature-text">
                Type safety across all flashcards, language interfaces, and state
                handlers ensuring resilient and bug-free scaling.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div>
          <span>© {new Date().getFullYear()} LanguageKing. All rights reserved.</span>
        </div>
        <div className="footer-badges">
          <span className="tech-tag">React 19</span>
          <span className="tech-tag">TypeScript 5</span>
          <span className="tech-tag">Vite 6</span>
        </div>
      </footer>
    </div>
  )
}

export default App
