# MoodBook — HANDOFF для нової сесії (станом на 6 вересня 2026, ранок)

Цей файл читати першим. Тут: що таке проєкт зараз, повна карта файлів, усі рішення власника і **весь відкладений беклог**. Джерела деталей: `CLAUDE.md` (правила), `docs/OPS.md` (квоти/кеш/моніторинг), `docs/ARCHITECTURE-APPS.md` (екосистема сайт+апки+оплата), `docs/TEAM-REVIEW-2026-09-05.md` (аудит командою), `docs/DESIGN.md` (візуальний контракт).

## 0. Стан на зараз
- **Live: https://moodbook.ink** (домен у Namecheap на BasicDNS; `www` і стара `moodbook-six.vercel.app` роблять 308 на нього). Прод = гілка `main` на Vercel, останній коміт `bc34acd`.
- Продукт: вводиш книгу → AI (Gemini, безкоштовний тариф із авто-фолбеком) складає 6 довгих YouTube-міксів + 5 сцен книги + 5 музичних стилів → грає у вбудованому плеєрі. Reading Card для шерингу. 10 мов інтерфейсу. Нічна тема. Free = 5 книг назавжди, далі Pro (оплати ще немає, промокоди працюють, власник має Pro через `?pro=1`).
- Vanilla JS/HTML/CSS + Vercel serverless. Без фреймворків, без збірки, без бази даних (усе користувацьке в localStorage).

## 1. Карта файлів
```
index.html            Лендинг + SPA (Discover / Library / Account), плеєр-док, paywall, модалка Reading Card. Усі тексти англійською = ключі перекладів.
privacy.html, terms.html, blocked.html   Політика, умови, заглушка для РФ.
css/app.css           Уся стилістика: токени «Lamp Light» (теплий крем + 6 пастелей), нічна тема [data-theme=dark], док, модалка, меню мов.
js/app.js             Логіка застосунку (ES-module, top-level await для i18n): пошук/підказки, AI-результати, плеєр (YouTube IFrame API), полиця/лайки/історія, paywall, Reading Card, тема, мови.
js/fx.js              Motion-шар: mesh-canvas у героі, reveals, word split, magnetic-кнопки, spotlight, marquee, tilt.
js/i18n.js            Мовний рушій: визначення мови, завантаження словника, переклад текстових вузлів, t().
js/lang/{uk,es,fr,de,it,pt,pl,zh,ja}.js   Словники (216 ключів кожен; ключ = англійський рядок). Російської немає і не буде.
js/card.js            Reading Card: canvas 1080×1350 (обкладинка через /api/cover, назва, why, 6 треків).
api/analyze.js        Один AI-виклик → {book, why, scenes[5], styles[5], tracks[6]}; identity rules; мова відповіді; кеш 7 днів (спільний) / degraded 3 хв.
api/books.js          Підказки: Google Books + Open Library паралельно, запити за назвою/автором/змішані, ранжування, бюджет Google.
api/search.js         YouTube search → найкраще довге embeddable відео; кеш 7 днів; при вичерпаній квоті — evergreen-мікси.
api/cover.js          Проксі обкладинок (Google Books / Open Library) для canvas без CORS-проблем.
api/health.js         Діагностика: env, провайдери, ?probe=1 (живий виклик AI, статус store, прапорці квот), ?models=1.
lib/ai.js             Ланцюг AI-провайдерів (OpenAI-сумісні), авто-міграція знятих моделей, обхід квоти через сусідні моделі, чесний probe.
lib/store.js          Upstash-сумісний KV через REST: layeredCache (памʼять + спільне сховище), прапорці, лічильник rate limit. Без env працює як памʼять.
lib/http.js           guard (метод, гео-блок RU → 451, rate limit), CORS, кеш-заголовки, fetchWithTimeout, makeCache.
lib/fallback.js       Офлайн жанровий плейлист, коли всі AI-провайдери впали.
lib/evergreen.js      14 музичних сімейств × 3 перевірених YouTube-відео для режиму без квоти.
vercel.json           maxDuration 60 для api, redirects (www/стара адреса → moodbook.ink), гео-рерайт RU → blocked.html, SPA-рерайт, заголовки кешу/безпеки.
manifest.webmanifest, robots.txt, sitemap.xml, assets/   PWA-маніфест, роботи, карта сайту, логотипи/іконки.
scripts/dev.mjs       Локальний сервер :3939 (монтує api/*.js як Vercel, читає .env.local). `npm run dev`.
scripts/mock-ai.mjs   Фейковий OpenAI-сумісний AI на :3940 для UI-тестів (завжди повертає Dune-подібну відповідь).
scripts/check-imports.mjs   Обовʼязково перед пушем: імпортує всі api/lib модулі, ловить синтаксичні помилки.
scripts/check-i18n.mjs      Обовʼязково після зміни текстів: паритет ключів і плейсхолдерів у всіх словниках.
docs/                 DESIGN.md (v4→v5), SKILLS-AUDIT.md (232 скіли), AUDIT-2026-09-05-v2.md, TEAM-REVIEW-2026-09-05.md, ARCHITECTURE-APPS.md, OPS.md, MoodBook-Project-Knowledge.md, HANDOFF.md (цей файл).
```

## 2. Змінні середовища на Vercel (Production + Preview)
`AI_API_KEY` (Gemini, aistudio), `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `AI_MODEL=gemini-2.5-flash` (знята → код сам мігрує на 3.6-flash; можна оновити на `gemini-3.6-flash`), `YT_API_KEY` (обмежений ключ GCP: YouTube Data API v3 + Books API). Опційно: `GOOGLE_BOOKS_KEY`, `AI_FALLBACK_*`, `AI_FALLBACK2_*`, `AI_PROVIDERS` (JSON), `UPSTASH_REDIS_REST_URL/TOKEN` або `KV_REST_API_URL/TOKEN`. Старі `OPENAI_API_KEY`, `SC_CLIENT_ID` не використовуються — можна видалити. Ключі вводить лише власник.

## 3. Рішення власника (не переглядати без запиту)
- Російської мови немає; територія РФ заблокована (сторінки → blocked.html, API → 451).
- Free = **5 книг назавжди** (не на день); книги з полиці граються безкоштовно; далі Pro. Ціни $9.99/міс, $99.99/рік.
- Оплата: власник обирає між WayForPay і Stripe, хоче ще PayPal; домен підключено саме для перевірки WayForPay. Пошти на сайті немає (прибрано за рішенням власника).
- Апки: **на паузі**. Коли повернемось — спочатку Google Play (Capacitor), Apple відкладено. План у ARCHITECTURE-APPS.md.
- Gemini: поки безкоштовний тариф; власник увімкне платний пізніше («потім проплачу»).
- SEO і маркетинг: **обовʼязково після платіжки** (див. беклог).
- Дизайн: «Lamp Light» (Fraunces + Figtree, крем + пастелі, нічна тема). Не міняти шрифтову пару й лого.

## 4. Беклог (усе, що зафіксовано, але не зроблено)
### A. Потребує дій власника (я не маю доступу)
1. **Upstash Redis** у Vercel Marketplace (Free) → спільний кеш і rate limit. Інструкція OPS.md §1. Перевірка: `/api/health?probe=1` → `"store": true`.
2. **Заявки на квоти**: YouTube Data API (зараз ~100 пошуків/день) і Google Books (1 000/день). Тексти для форм в OPS.md §2.
3. **Vercel Web Analytics**: увімкнути в проєкті (скрипт уже в index.html).
4. **UptimeRobot** на `https://moodbook.ink/api/health?probe=1`.
5. **Платіжка**: рішення WayForPay / Stripe / PayPal (порівняння в останніх повідомленнях сесії 5.09: WayForPay працює з ФОП; Stripe потребує закордонної компанії; PayPal-бізнес в Україні обмежений).
6. Старий публічний Google-ключ `AIzaSyD_GX…` з історії git — видалити в GCP; зайві env `OPENAI_API_KEY`, `SC_CLIENT_ID` — видалити.
7. Telegram/Instagram створити → тоді og:image 1200×630 і посилання на канал.
8. Gemini billing з бюджетним лімітом (коли готовий).

### B. Після платіжки (обовʼязково, рішення власника)
9. **Supabase**: акаунти (magic link + Google/Apple), таблиці profiles/entitlements/shelf/liked_tracks/promo_codes, `/api/me`, міграція localStorage → акаунт. Це передумова чесного Pro і синхронізації.
10. **Вебхук платіжки** → `entitlements`; `isPro()` через `/api/me` з локальним кешем.
11. **SEO**: сторінки книг `/book/<slug>` для топ-100–200 книг (статичний HTML із того ж `/api/analyze`, кеш назавжди) + sitemap; один `<h1>` на сторінку (зараз три); `FAQPage` schema; заголовок із ключовими словами.
12. **Маркетинг**: лист очікування або Telegram замість «Payments open soon»; підказка «зроби Reading Card» після першого треку + UTM у посиланні картки; лічильник підборів як соціальний доказ; Reddit-пости про книги з картками; BookTok-формат; Product Hunt лише після цього.
13. og:image 1200×630 (Reading-Card-стиль).

### C. Продуктові дрібниці (можна будь-коли)
14. Демо-картка в героі виглядає як живий плеєр, але статична: зробити клікабельною (запуск Dune) або прибрати «Now playing».
15. Порожня полиця може пропонувати 3 популярні книги.
16. Перевірити контраст тексту на шести пастелях (близько 4.5:1).
17. Мобільні результати: міні-док типовим після першого play; переконатись, що список треків не ховається під плеєром.
18. `www.moodbook.ink` у Vercel стоїть як Production (редірект робить vercel.json). Можна виставити 308-редірект у самому Vercel, UI випадного списку тоді не дався.
19. `AI_MODEL` у Vercel оновити на `gemini-3.6-flash`, щоб не робити зайвий 404-запит на холодному старті.
20. Переклади 8 мов зроблені мною без носіїв — попросити перших користувачів пробігтись.
21. Smoke-скрипт для прод-API (5 запитів, тривога на degraded/5xx) на GitHub Actions за розкладом.
22. `i18n.js`-словник вантажиться лише для активної мови — ок; `app.js` 48 КБ — можна розділити, не критично.

### D. Апки (на паузі)
23. Capacitor-оболонка, Google Play першим; RevenueCat для IAP; спільні entitlements. Ризик: YouTube не грає у фоні в мобільній апці. Усе в ARCHITECTURE-APPS.md.

## 5. Як працювати локально й перевіряти
- `npm run dev` → http://localhost:3939. AI локально — мок: запускати `node scripts/mock-ai.mjs`, а dev з `AI_API_KEY=mock AI_BASE_URL=http://localhost:3940/v1`. `.env.local` зараз відсутній → YouTube/Google локально не працюють; реальні перевірки робити на проді.
- Перед пушем: `node scripts/check-imports.mjs`; після зміни текстів: `node scripts/check-i18n.mjs`.
- Після змін CSS/JS підняти `?v=YYYYMMDDxN` в index.html, privacy.html, terms.html **і в статичних import-ах js/app.js** (fx.js, i18n.js). Поточна версія: `20260905h16`.
- Прод-перевірка: `https://moodbook.ink/api/health?probe=1`; один живий пошук; `?pro=1` для тестового Pro; промокод `MOODBOOK2024`.
- Vercel-превʼю захищені SSO — відкриваються лише в браузері власника.
- Код зі зворотними слешами правити через Edit/Write, не через bash-heredoc (зʼїдає екранування). Дев-сервер перечитує api/, але не lib/ — після змін у lib перезапускати.

## 6. Відомі граблі
- Gemini free tier: денна квота на кожну модель окремо; 429-відповідь приходить масивом `[{"error":…}]`. Код обходить через сусідні моделі; при повному провалі — офлайн жанровий плейлист із «Try again».
- YouTube 403 quotaExceeded → evergreen-мікси до опівночі за Тихоокеанським часом (прапорець у store).
- localStorage привʼязаний до домену: після переїзду на moodbook.ink Pro/полиця зі старої адреси не переносяться (власник уже відкрив `?pro=1` на новому домені; другові треба теж).
- Namecheap раніше призупиняв домен через непідтверджений WHOIS — підтверджено 6.09.2026. Якщо змінюватимеш контакти домену, знову прийде лист на підтвердження.
