# CLAUDE.md — Контекст проєкту MoodBook

> **Починай із `docs/HANDOFF.md`** — там актуальний стан, карта файлів, рішення власника і повний беклог (оновлено 6 вересня 2026).

## Хто власник і як працювати
- Власник: Михайло, соло-фаундер з Києва. Не професійний розробник — бутстрепить продукт сам.
- **Спілкуйся українською мовою.**
- Пояснюй прості речі просто, без зайвого жаргону. Давай покрокові інструкції з підтвердженням на кожному етапі.
- Перед великими змінами коду — коротко поясни план і дочекайся підтвердження.
- Не ускладнюй: рішення мають бути мінімальними й практичними, без оверінжинірингу.

## Що таке MoodBook
MoodBook (moodbook.ink) — AI-сервіс музичної курації для читачів: генерує інструментальні плейлисти, підібрані під конкретну книгу. Користувач вводить назву книги → AI аналізує її настрій/атмосферу → сервіс видає добірку інструментальних треків для читання під цю книгу.

- Live: **https://moodbook.ink** (стара адреса moodbook-six.vercel.app і www робить 301 на неї; домен у Namecheap на BasicDNS, A @ 216.198.79.1 + CNAME www → Vercel)
- GitHub: portianoi1993/moodbook-

## Технічний стек (v2, гілка `v2`)
- Frontend: vanilla JS + HTML + CSS (без фреймворків). Файли: `index.html`, `css/app.css`, `js/app.js` (ES-module), статика в `assets/`.
- Hosting: Vercel. Serverless-функції в `api/`, спільний код у `lib/http.js` (rate limit, CORS, кеш, таймаути). `package.json` має `"type":"module"`.
- API:
  - `GET /api/analyze?title&author&genre&desc&mood` — один AI-виклик → `{book, why, moods[6], tracks[6]}`; кеш у пам'яті 24 год + CDN 7 днів.
  - `GET /api/books?q&limit` / `&best=1` — Google Books + Open Library паралельно (плюс title-wildcard для часткових слів), злиття й ранжування; працює навіть коли Google без квоти.
  - `GET /api/search?q` — найкраще embeddable довге відео YouTube (+3 альтернативи).
  - `GET /api/health?probe=1` — діагностика env і тестовий виклик AI (показує реальну помилку апстріму).
- AI: **безкоштовні провайдери з авто-фолбеком** (`lib/ai.js`). Env: `AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL` (основний), `AI_FALLBACK_*` і `AI_FALLBACK2_*` (запасні). Рекомендовано: основний Google Gemini (`https://generativelanguage.googleapis.com/v1beta/openai`, `gemini-2.5-flash`, ключ з aistudio.google.com без картки), запасний Groq (`https://api.groq.com/openai/v1`, `llama-3.3-70b-versatile`). OpenAI більше не потрібен. Якщо всі провайдери впали, `lib/fallback.js` збирає жанровий плейлист офлайн (`degraded:true`).
- Музика: YouTube Data API v3 (`YT_API_KEY`). Плеєр — YouTube IFrame API у постійному доку (не ховати iframe: вимога YouTube до мінімального розміру).
- Книги: Google Books (`GOOGLE_BOOKS_KEY`, fallback `YT_API_KEY`).
- Локально: `npm run dev` → http://localhost:3939 (читає `.env.local`); `node scripts/mock-ai.mjs` — мок AI для UI-тестів без ключа.
- Безпека: rate limiting per IP (best-effort, in-memory), санітизація довжин, security-заголовки у `vercel.json`, жодних ключів у клієнтському коді.

## Ключові продуктові рішення (вже ухвалені — не переглядати без запиту)
- Тарифи: $9.99/міс або $99.99/рік; безкоштовний рівень — 3 пошуки
- Оплата: WayForPay (інтеграція відкладена до оформлення ФОП)
- Auth + синхронізація бібліотеки + промокоди: план на Supabase (ще не інтегровано)
- Бібліотека користувача: shelf-grid розкладка (полиці з книгами)

## Що вже зроблено
- **v2 (вересень 2026):** повний переробок фронтенду під mobile-first + постійний плеєр + новий бекенд (див. `docs/AUDIT-2026-09-05-v2.md`). Live на `main` досі стара версія, у якої AI-ендпоінт повертає 502.
- Робочий MVP: пошук книги → аналіз → плейлист
- Перехід із SoundCloud на YouTube як джерело музики
- Виправлені обмеження API-ключів у Google Cloud Console (Books API був заблокований)
- Рефакторинг сторінки бібліотеки на shelf-grid
- Rate limiting + санітизація інпутів
- Пофікшені UX-баги: анімація «плаваючих» книг, збої автокомпліту, адаптивність на широких екранах

## Roadmap / що попереду
1. Інтеграція Supabase: авторизація, збереження бібліотеки, промокоди
2. Платіжна інтеграція WayForPay (після ФОП)
3. Лендинг + маркетинг: Reddit (основний канал), BookTok-стиль TikTok/Reels, мікроінфлюенсери, Goodreads-коментинг, Product Hunt
4. Вірусна механіка «Reading Card» — картка книги+плейлиста, якою можна ділитися
5. Паралельний клон MoodBoard — те саме для настільних ігор (BoardGameGeek API), поки лише план

## Дизайн
- Візуальний контракт: `docs/DESIGN.md` («Nocturne»: темне кіно-скло, Bricolage Grotesque + Geist + Geist Mono, пара violet→teal, magnetic-кнопки, mesh-атмосфера в героі). Вердикти по всіх 232 скілах: `docs/SKILLS-AUDIT.md`; згенерована база: `design-system/moodbook/MASTER.md`. Перед будь-якою UI-зміною читати DESIGN.md.
- Motion-шар живе в `js/fx.js` (mesh canvas, reveals, word split, magnetic, spotlight, marquee, tilt). Нові інтерактивні елементи: `data-magnetic` (не більше 1–2 на екран), `data-spot`, `data-reveal`.

## Правила для коду
- Не додавати фреймворки (React тощо) — проєкт свідомо на vanilla JS
- Не ламати наявну структуру serverless-функцій на Vercel
- API-ключі — тільки через environment variables на Vercel, ніколи не хардкодити в код
- Після змін пояснювати, що саме змінилося і як це перевірити
- Перед пушем запускати `node scripts/check-imports.mjs` (ловить синтаксичні помилки у serverless-модулях до деплою) і, якщо змінювались тексти інтерфейсу, `node scripts/check-i18n.mjs` (10 мов у `js/lang/`, ключ словника = англійський рядок з index.html/app.js; російської мови немає і не буде, РФ заблокована)
- Код зі зворотними слешами (регулярки, `
`) правити через Edit/Write, а не через bash-heredoc + python: heredoc у цьому середовищі зʼїдає екранування
- Перед дизайн-роботою спершу перевірити, що прод реально працює (`/api/health?probe=1` і один живий пошук)
- Дані користувача в localStorage: ключі `mb_books`, `mb_liked_tracks`, `mb_pro`, `mb_total_searches`, `mb_day_YYYY-MM-DD` — не перейменовувати
- Після змін у CSS/JS піднімати версію `?v=YYYYMMDDxN` одночасно в index.html, privacy.html, terms.html **і в статичних import-ах js/app.js** (fx.js, i18n.js) — браузер кешує /js на годину, і без цього користувачі отримують старий модуль
- Коміти робити з короткими зрозумілими повідомленнями англійською
