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
### YouTube Data API v3 (зараз 10 000 одиниць/день = ~100 пошуків)
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
- **YouTube без квоти** (`quotaExceeded`) → до опівночі за Тихоокеанським часом грають **evergreen-мікси**: перевірені довгі відео за 14 музичними сімействами (`lib/evergreen.js`), підібрані за словами запиту. Користувач бачить одну підказку про це. Реальні пошуки кешуються на 7 днів; підігрівається лише перший трек.
- **Google Books без квоти** → 15 хвилин лише Open Library; авторський індекс Google питаємо тільки для запитів із двох і більше слів.
- **Rate limit** рахується спільно між інстансами, якщо є Redis.
- `/api/health?probe=1` показує статус store, прапорці вичерпаних квот і тестовий виклик AI.
