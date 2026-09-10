# MoodBook — OPS: квоти, кеш, моніторинг (5 вересня 2026)

Усе безкоштовно. Три речі, які треба зробити руками (я не маю доступу до твоїх акаунтів), і пояснення, що вже робить код сам.

## 1. Постійний кеш і чесний rate limit — Upstash Redis (безкоштовно, 5 хвилин)
Навіщо: зараз кеш підборів, YouTube-пошуків і підказок живе в памʼяті функції та в CDN. Після «холодного старту» він порожній, і той самий запит знову йде в Gemini/YouTube/Google і зʼїдає квоту. Redis робить кеш спільним для всіх інстансів і регіонів: одна книга підбирається один раз на тиждень для всіх.

Кроки:
1. Vercel → проєкт **moodbook** → вкладка **Storage** (або **Marketplace**) → **Upstash for Redis** → Create → план **Free**.
2. У майстрі постав галочки **Production** і **Preview**, натисни Connect. Vercel сам додасть змінні `UPSTASH_REDIS_REST_URL` і `UPSTASH_REDIS_REST_TOKEN` (або `KV_REST_API_URL`/`KV_REST_API_TOKEN`). Код розуміє обидві пари.
3. Redeploy (Deployments → останній → Redeploy) або просто дочекайся наступного пушу.
4. Перевірка: відкрий `https://moodbook.ink/api/health?probe=1` — має бути `"store": true` і `"store": {"ok": true}`.

Без Redis усе працює як раніше (памʼять + CDN), просто менш стійко.

## 2. Заявки на збільшення квот (безкоштовно, розгляд 1–3 тижні)
### YouTube Data API v3 (зараз 10 000 одиниць/день = ~100 пошуків) — **заявку подано 10.09.2026**, чекаємо
1. Google Cloud Console → проєкт «My First Project» → APIs & Services → **YouTube Data API v3** → **Quotas**.
2. Знайди «Queries per day», натисни олівець → «Apply for higher quota».
3. Форма: опиши сервіс так: *MoodBook is a web app that recommends long instrumental YouTube mixes matched to the book a reader is currently reading. Each user action performs one search.list call; results are cached for 7 days. Requested: 100,000 units/day.* Додай посилання на сайт, Privacy і Terms (вони є). Скріншоти інтерфейсу допомагають.
4. Google може попросити пройти **API compliance audit** — це стандартно, відповідай чесно: не зберігаємо відео, не показуємо реклами, дотримуємось брендингу плеєра.

### Google Books API (зараз 1 000 запитів/день)
APIs & Services → **Books API** → Quotas → «Queries per day» → Apply. Опис: *Autocomplete of book titles/authors for a reading-music service, results cached 7 days, ~3 requests per user session.* Просити 50 000/день.

### Gemini (AI)
Коли будеш готовий платити: aistudio.google.com → **Get API key** → **Set up billing** → постав **бюджетний ліміт** (наприклад $10/міс). Один підбір коштує близько $0.001 і кешується.

## 3. Моніторинг (безкоштовно)
- **UptimeRobot** (uptimerobot.com, безкоштовний план): монітор типу HTTP(s) на `https://moodbook.ink/api/health?probe=1`, інтервал 10 хвилин, alert на email/Telegram. Health повертає 503, якщо жодний AI-провайдер не відповідає.
- **Vercel → Logs**: фільтр `[ai]`, `[search]`, `[books]`, `[store]` показує, що саме впало.

## Що код робить сам (нічого натискати не треба)
- **Gemini без квоти** → сусідні моделі того самого ключа (flash-lite, інші flash, gemma), потім офлайн-жанровий плейлист із кнопкою «Try again».
- **YouTube без квоти** (`quotaExceeded`) → до опівночі за Тихоокеанським часом грають **evergreen-мікси**: перевірені довгі відео за 14 музичними сімействами (`lib/evergreen.js`), підібрані за словами запиту. Користувач бачить одну підказку про це. Реальні пошуки кешуються на 60 днів; підігрівається лише перший трек.
- **Самозростаючий каталог** (`lib/catalog.js`, з 10.09.2026): кожен справжній результат пошуку зберігається назавжди (`mb:ytc:v:<слова>` + список `mb:ytc:index`). Новий запит спершу шукає в каталозі запит із тим самим змістом (збіг значущих слів ≥ 60 %, «music» і «ambience» рахуються значущими, щоб музику не плутати зі звуками) і йде в YouTube лише коли схожого немає. Порядок: точний кеш → каталог → перевірка квоти → YouTube. Заголовок відповіді `X-Source: youtube | catalog | catalog-similar`. `/api/health?probe=1` показує `youtube.searchesToday` (з ~100) і `youtube.catalog` (скільки запитів уже безкоштовні).
- **Google Books без квоти** → 15 хвилин лише Open Library; авторський індекс Google питаємо тільки для запитів із двох і більше слів.
- **Rate limit** рахується спільно між інстансами, якщо є Redis.
- `/api/health?probe=1` показує статус store, прапорці вичерпаних квот і тестовий виклик AI.

## 4. Промокоди для блогерів (унікальні, одноразові)
Працюють лише зі сховищем Upstash (розділ 1) і змінною `ADMIN_TOKEN` у Vercel (придумай довгий випадковий рядок, наприклад 32 символи, і додай як env для Production; ніде його не публікуй).

- **Створити код на рік Pro для блогера:** відкрий у браузері
  `https://moodbook.ink/api/promo?admin=ТВІЙ_ТОКЕН&create=1&note=Ім'я блогера&days=365`
  У відповіді буде `code` (вигляд `MB-XXXX-XXXX`) і готове посилання `https://moodbook.ink/?code=MB-XXXX-XXXX`. Надішли блогеру або код, або посилання: відкривши його, людина одразу отримує Pro, і код згорає.
- **Довічний код** (наприклад, для себе або друга): `…&days=36500`. **Багаторазовий код** для аудиторії блогера (наприклад, 50 активацій): `…&uses=50`.
- **Список кодів і хто використав:** `https://moodbook.ink/api/promo?admin=ТВІЙ_ТОКЕН&list=1`
- **Відкликати код:** `…&revoke=MB-XXXX-XXXX`
- Активація: користувач вводить код у полі «Promo code» (paywall або Account) або відкриває посилання з `?code=`. Регістр і дефіси неважливі. Другий раз той самий код відповідає «already been used».
- Технічно: `api/promo.js`, записи `mb:promo:<CODE>` у сховищі, атомарний лічильник використань; Pro у браузері зберігається як `mb_pro` + `mb_pro_until` (дата закінчення), після якої статус сам повертається на Free.
