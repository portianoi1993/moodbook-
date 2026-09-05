/* MoodBook — tiny i18n. The English copy in index.html is the source of truth and the dictionary key.
   applyI18n() walks the page once at boot and swaps text nodes / placeholders / aria-labels whose
   English text has a translation. Dynamic strings in app.js go through t('English text', vars).
   Switching language stores mb_lang and reloads (the hero word-split and canvas layers are built once). */

export const LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'uk', label: 'Українська', short: 'UA' },
];

const UK = {
  // header / nav
  'Skip to content': 'До вмісту', 'Discover': 'Пошук', 'Library': 'Бібліотека', 'Account': 'Акаунт', 'Free': 'Free', 'Pro': 'Pro',
  'Your plan': 'Ваш план', 'MoodBook home': 'На головну', 'Language': 'Мова', 'Night mode': 'Нічний режим', 'Day mode': 'Денний режим',
  // hero
  'A soundtrack for every book': 'Саундтрек до кожної книги',
  hero_h1: 'У кожної книги є <em class="it" data-words>свій звук.</em>',
  "Type the book you're reading and get six long mixes composed for its world, mood and pace. No account needed.": 'Введи книгу, яку читаєш, і отримай шість довгих міксів, складених під її світ, настрій і темп. Без реєстрації.',
  'What are you reading?': 'Що ти читаєш?', 'Book title or author…': 'Назва книги або автор…', 'Compose': 'Підібрати', 'Compose soundtrack': 'Підібрати саундтрек', 'Try': 'Спробуй',
  // demo card
  'Sample · what you get': 'Приклад · що ти отримуєш', 'Frank Herbert · Epic sci-fi': 'Френк Герберт · Епічна фантастика',
  'Wide desert textures with a slow pulse underneath. Tension that never fully resolves.': 'Широкі пустельні текстури з повільним пульсом. Напруга, що ніколи не спадає до кінця.',
  'more mixes · six scenes to switch between': 'ще мікси · шість сцен для перемикання', 'Now playing': 'Зараз грає', 'Scene': 'Сцена',
  'Books readers composed for recently': 'Книги, для яких нещодавно підбирали музику',
  // how it works
  'How it works': 'Як це працює', how_h2: 'Від назви до <span class="grad-text">саундтреку</span> за один подих.',
  'No playlists to dig through. Name the book, and the room fills with the right music.': 'Жодних плейлистів, у яких треба копатися. Назви книгу, і кімната наповниться правильною музикою.',
  '01 · Read the room': '01 · Відчути атмосферу', 'We understand the book, not just the genre.': 'Ми розуміємо книгу, а не лише жанр.',
  'Setting, era, tone and pace become a sonic brief. Dune gets wind and drums, a self-help book gets steady focus beats.': 'Місце дії, епоха, тон і темп стають музичним завданням. «Дюна» отримує вітер і барабани, книга з саморозвитку — рівні біти для фокусу.',
  '02 · Six long mixes': '02 · Шість довгих міксів', 'Hour-long and ready to play.': 'Годинні й готові до відтворення.',
  'Real YouTube mixes, checked for length and embeddability, in a player that stays with you.': 'Справжні мікси з YouTube, перевірені на тривалість, у плеєрі, що завжди з тобою.',
  '03 · Scenes': '03 · Сцени', 'Switch the mood when the chapter turns.': 'Змінюй настрій, коли змінюється розділ.',
  'Quiet night reading, then a battle. Pick a scene and the whole soundtrack re-tunes to it.': 'Тихе нічне читання, а потім битва. Обери сцену, і весь саундтрек підлаштується.',
  '04 · Your shelf': '04 · Твоя полиця', 'Keep what you love.': 'Зберігай улюблене.',
  "Save books to a shelf, heart the mixes you'll want again, and jump back in with one tap.": 'Додавай книги на полицю, лайкай мікси, до яких хочеш повернутися, і вмикай їх одним дотиком.',
  // why
  'Why it works': 'Чому це працює', 'The right music pulls you deeper into the page. The wrong music pulls you out.': 'Правильна музика затягує глибше в сторінку. Неправильна — витягує з неї.',
  'Matched, not generic.': 'Підібрано, а не навмання.', 'Every mix is composed for the exact book, its setting and its pace.': 'Кожен мікс складено саме під цю книгу, її світ і темп.',
  'Long enough for a chapter.': 'Вистачить на розділ.', 'Mixes run an hour or more, so nothing interrupts you mid-page.': 'Мікси тривають годину й більше, тож ніщо не перерве тебе посеред сторінки.',
  'Free to start.': 'Безкоштовний старт.', 'Your first five books are free, no sign-up. Pro removes the limit and syncs your shelf.': 'Перші пʼять книг безкоштовно, без реєстрації. Pro знімає ліміт і синхронізує полицю.',
  // plans
  'Plans': 'Тарифи', "Start free. Go unlimited when you're hooked.": 'Почни безкоштовно. Знімай ліміт, коли затягне.',
  '5 books to try': '5 книг на пробу', '6 mixes and 6 scenes per book': '6 міксів і 6 сцен на книгу', 'Shelf and liked tracks in this browser': 'Полиця й лайки в цьому браузері',
  'No sign-up. Start above.': 'Без реєстрації. Починай вище.', 'Pro · early access': 'Pro · ранній доступ', '/mo': '/міс', '/yr': '/рік',
  'Unlimited books': 'Необмежено книг', 'Everything synced across devices': 'Синхронізація між пристроями', 'Liked tracks saved forever': 'Лайкнуті треки назавжди',
  'See the Pro plan': 'Дивитися план Pro', 'or $99.99 a year (save 17%). Card payments open with the public launch.': 'або $99.99 на рік (економія 17%). Оплата карткою відкриється з публічним запуском.',
  // faq
  'Questions': 'Питання', 'Good to know.': 'Корисно знати.',
  'Where does the music come from?': 'Звідки береться музика?',
  'From YouTube. MoodBook searches for long, embeddable mixes that fit each scene and plays them in a built-in player. Nothing is downloaded or re-hosted.': 'З YouTube. MoodBook шукає довгі мікси, які підходять під кожну сцену, і програє їх у вбудованому плеєрі. Нічого не завантажується і не копіюється.',
  'Does it work for books in other languages?': 'Чи працює з книгами іншими мовами?',
  'Yes. Type the title as you know it, in Ukrainian, Spanish, Korean or anything else. MoodBook identifies the book and composes for it.': 'Так. Вводь назву так, як знаєш: українською, іспанською, корейською чи будь-якою іншою. MoodBook впізнає книгу і підбере музику.',
  "What if it doesn't know my book?": 'А якщо мою книгу не знає?',
  'It still composes from the title and genre it can infer, and tells you so. Picking the book from the suggestion list gives the best result.': 'Тоді підбере за назвою і жанром, які зможе визначити, і чесно про це скаже. Найкращий результат — обрати книгу зі списку підказок.',
  'Can I listen on my phone?': 'Чи можна слухати з телефона?',
  'Yes. MoodBook is a website that works on any phone or tablet. Add it to your home screen for an app-like experience.': 'Так. MoodBook — це сайт, який працює на будь-якому телефоні чи планшеті. Додай його на головний екран, і буде як застосунок.',
  'Is my library private?': 'Моя бібліотека приватна?',
  'Your shelf and liked tracks are stored in your browser only. Account sync arrives with Pro.': 'Полиця й лайки зберігаються лише у твоєму браузері. Синхронізація з акаунтом з’явиться разом із Pro.',
  'How much does it cost?': 'Скільки це коштує?',
  'Your first five books are free. Pro is $9.99 a month or $99.99 a year and opens unlimited books and sync.': 'Перші пʼять книг безкоштовно. Pro коштує $9.99 на місяць або $99.99 на рік і відкриває необмежену кількість книг та синхронізацію.',
  final_h2: 'Бери книгу. <span class="grad-text">Настрій ми створимо.</span>', 'Compose a soundtrack': 'Підібрати саундтрек',
  // results
  '← New search': '← Новий пошук', '+ Save to shelf': '+ На полицю', '✓ On your shelf': '✓ На полиці', 'Share': 'Поділитися', 'Soundtrack': 'Саундтрек',
  'Scenes in this book': 'Сцени в цій книзі', "Pick the moment you're reading and the soundtrack re-tunes to it.": 'Обери момент, який читаєш, і саундтрек підлаштується.',
  'Music style': 'Стиль музики', 'Lofi, piano, orchestral… styles that suit this book. Combine with a scene.': 'Лофай, фортепіано, оркестр… стилі, що пасують цій книзі. Поєднуй зі сценою.',
  'Scenes': 'Сцени', 'Music styles': 'Стилі музики',
  'First time here?': 'Уперше тут?', 'Press play': 'Натисни play', 'on any mix. The player stays with you while you browse.': 'на будь-якому міксі. Плеєр лишається з тобою, поки ти гортаєш сайт.',
  'Switch the scene': 'Перемикай сцену', 'or the music style when the chapter changes mood.': 'або стиль музики, коли настрій розділу змінюється.',
  'Save to shelf': 'Збережи на полицю', 'to come back to this book in one tap.': 'щоб повернутися до книги одним дотиком.', 'Got it': 'Зрозуміло',
  // paywall
  'Your five free books are used': 'Пʼять безкоштовних книг використано', pay_h2: 'Хай музика грає далі з <em>Pro</em>',
  'Unlimited books, every day': 'Необмежено книг щодня', 'All scene moods unlocked': 'Усі сцени відкрито', 'Shelf and liked tracks synced across devices': 'Полиця й лайки на всіх пристроях',
  '/month': '/місяць', '/year': '/рік', 'or {price}/year (save 17%)': 'або {price}/рік (економія 17%)', 'or {price}/month': 'або {price}/місяць',
  'Payments open soon': 'Оплата скоро відкриється', 'Promo code…': 'Промокод…', 'Promo code': 'Промокод', 'Apply': 'Застосувати',
  'Books already on your shelf keep playing for free. Card payments open with the public launch; until then a promo code unlocks Pro.': 'Книги, що вже на полиці, граються безкоштовно й далі. Оплата карткою відкриється з публічним запуском, а до того Pro відкриває промокод.',
  // library
  'Shelf': 'Полиця', 'My library': 'Моя бібліотека', 'Your books, one tap from their soundtrack.': 'Твої книги за один дотик від їхнього саундтреку.',
  'Add a book': 'Додати книгу', 'Add a book — title or author…': 'Додати книгу — назва або автор…', 'Add': 'Додати', 'Books': 'Книги', 'Liked tracks': 'Лайкнуті треки',
  'Filter liked tracks': 'Фільтр лайкнутих треків', 'Filter by track or book…': 'Фільтр за треком чи книгою…', 'Recently played': 'Нещодавно грало',
  'Your shelf is empty. Add a book above, or save one from a search.': 'Полиця порожня. Додай книгу вище або збережи з пошуку.',
  'No liked tracks yet. Tap the heart on any track while listening.': 'Лайкнутих треків ще немає. Натисни сердечко на будь-якому треку під час прослуховування.',
  'Nothing played yet. Your last 30 mixes will appear here.': 'Ще нічого не грало. Тут з’являться останні 30 міксів.',
  'Nothing matches “{q}”.': 'Нічого не знайдено за «{q}».', 'Already on your shelf': 'Уже на полиці', '“{title}” added': '«{title}» додано', '“{title}” added to your Library': '«{title}» додано до бібліотеки',
  'Removed “{name}”': 'Прибрано «{name}»', 'Undo': 'Повернути', '♥ Saved to liked tracks': '♥ Збережено в лайкнуті',
  'Play soundtrack for {title}': 'Увімкнути саундтрек до {title}', 'Remove {title} from shelf': 'Прибрати {title} з полиці', 'Play {name}': 'Увімкнути {name}', 'Like {name}': 'Лайкнути {name}',
  'Remove {name} from liked': 'Прибрати {name} з лайкнутих', 'Open {book}': 'Відкрити {book}', 'Open this book': 'Відкрити цю книгу',
  '{m} min ago': '{m} хв тому', '{h} h ago': '{h} год тому', 'yesterday': 'вчора', '{d} days ago': '{d} дн. тому',
  // account
  'Plan & usage': 'План і використання', 'Everything here lives in this browser until sync arrives with Pro.': 'Усе тут живе в цьому браузері, поки не з’явиться синхронізація з Pro.',
  'Reader': 'Читач', 'Liked': 'Лайки', 'Searches': 'Пошуки', 'Billing period': 'Період оплати', 'Monthly': 'Щомісяця', 'Annual': 'Щороку', 'save 17%': 'економія 17%',
  '6 mixes per book': '6 міксів на книгу', 'Scene moods': 'Сцени-настрої', 'Shelf in this browser': 'Полиця в цьому браузері',
  'Current plan': 'Поточний план', 'Included': 'Включено', 'All scene moods': 'Усі сцени', 'Sync shelf across devices': 'Полиця на всіх пристроях',
  "You're on Pro ✦": 'У тебе Pro ✦', 'Have a promo code?': 'Є промокод?', 'Enter code…': 'Введи код…',
  // footer
  'Made in Kyiv · music via YouTube · books via Google Books': 'Зроблено в Києві · музика з YouTube · книги з Google Books', 'Privacy': 'Приватність', 'Terms': 'Умови',
  // dock
  'Previous track': 'Попередній трек', 'Next track': 'Наступний трек', 'Pause': 'Пауза', 'Play': 'Грати', 'Show video': 'Показати відео', 'Hide video': 'Сховати відео', 'Show / hide video': 'Показати / сховати відео',
  'Minimize player': 'Згорнути плеєр', 'Restore player': 'Розгорнути плеєр', 'Minimize player (music keeps playing)': 'Згорнути плеєр (музика грає далі)',
  'Stop and close player': 'Зупинити й закрити плеєр', 'Stop and close': 'Зупинити й закрити', 'Playback position, click or use arrow keys to seek': 'Позиція відтворення: клікни або використовуй стрілки',
  'Finding the mix…': 'Шукаю мікс…',
  // modal
  'Reading Card': 'Reading Card', 'Share this soundtrack': 'Поділитися цим саундтреком', 'Drawing your card…': 'Малюю картку…', 'Share image': 'Поділитися картинкою', 'Download': 'Завантажити', 'Copy link': 'Скопіювати посилання',
  'The image is drawn in your browser. Nothing is uploaded.': 'Картинка малюється у твоєму браузері. Нічого нікуди не завантажується.', 'Close': 'Закрити', 'Link copied': 'Посилання скопійовано',
  'Copy failed. The link is in your address bar.': 'Не вдалося скопіювати. Посилання є в адресному рядку.', "Couldn't draw the card ({msg}). You can still copy the link below.": 'Не вдалося намалювати картку ({msg}). Посилання нижче все одно можна скопіювати.',
  "Reading “{title}”? Here's a soundtrack composed for it 🎧": 'Читаєш «{title}»? Ось саундтрек, складений під неї 🎧',
  // dynamic: search / status / toasts
  'Identifying the book…': 'Визначаю книгу…',
  'Showing the best-known book by {author}. Pick another one from the suggestions.': 'Показую найвідомішу книгу автора {author}. Іншу можна обрати з підказок.', 'Composing the soundtrack…': 'Складаю саундтрек…', 'Re-tuning for “{what}”…': 'Підлаштовую під «{what}»…',
  'Our AI is busy right now, so this soundtrack was matched by genre, not by this exact book.': 'Наш AI зараз зайнятий, тож цей саундтрек підібрано за жанром, а не під саме цю книгу.', 'Try again': 'Спробувати ще раз',
  "Couldn't compose the soundtrack.": 'Не вдалося скласти саундтрек.', 'Scenes will appear once the soundtrack loads.': 'Сцени з’являться, щойно завантажиться саундтрек.',
  '{n} long mixes': '{n} довгих міксів', 'Unknown author': 'Невідомий автор', 'Cover of {title}': 'Обкладинка «{title}»',
  '<b>Pro</b> · unlimited books': '<b>Pro</b> · без обмежень', '<b>{n} of {max}</b> free {word} left': '<b>{n} з {max}</b> безкоштовних книг',
  '<b>Your {max} free books are used</b> · Pro continues where you left off': '<b>{max} безкоштовних книг використано</b> · Pro продовжує з цього місця',
  'YouTube search is rate-limited right now, so this is a matching evergreen mix instead of a book-specific one.': 'Пошук YouTube зараз обмежений, тож грає підібраний за стилем постійний мікс замість міксу під саму книгу.',
  'Pro unlocked in this browser': 'Pro увімкнено в цьому браузері', '🎉 Pro activated. Unlimited books, enjoy.': '🎉 Pro активовано. Книг без обмежень, насолоджуйся.',
  "That code didn't work. Check the spelling and try again.": 'Цей код не спрацював. Перевір написання і спробуй ще раз.',
  'YouTube refused that video. Skipping…': 'YouTube відмовив у цьому відео. Пропускаю…', 'Search failed: {msg}': 'Пошук не вдався: {msg}', 'No good mix found for that one. Try another track.': 'Гарного міксу не знайшлося. Спробуй інший трек.',
  'Rate limit reached. Try again in a few minutes.': 'Забагато запитів. Спробуй за кілька хвилин.', 'Request failed ({status})': 'Запит не вдався ({status})',
  "MoodBook — A soundtrack for the book you're reading": 'MoodBook — саундтрек до книги, яку ти читаєш',
};

const DICTS = { en: {}, uk: UK };

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function detectLang() {
  const saved = (() => { try { return localStorage.getItem('mb_lang'); } catch { return null; } })();
  if (saved && DICTS[saved]) return saved;
  const langs = (navigator.languages || [navigator.language || 'en']).map((l) => String(l).toLowerCase());
  if (langs.some((l) => l.startsWith('uk'))) return 'uk';
  return 'en';
}
let current = detectLang();
export const getLang = () => current;
export function setLang(code) {
  if (!DICTS[code] || code === current) return;
  try { localStorage.setItem('mb_lang', code); } catch {}
  location.reload();
}

export function t(key, vars) {
  let s = DICTS[current][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const HTML_KEYS = { 'hero-title': 'hero_h1', 'how-title': 'how_h2', 'final-title': 'final_h2', 'pay-h2': 'pay_h2' };

/** Translate the static page once. Safe to call before the motion layer mounts. */
export function applyI18n(root = document) {
  document.documentElement.lang = current;
  if (current === 'en') return;
  const dict = DICTS[current];
  for (const [id, key] of Object.entries(HTML_KEYS)) { const n = root.getElementById ? root.getElementById(id) : root.querySelector('#' + id); if (n && dict[key]) n.innerHTML = dict[key]; }
  const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest('script,style,[data-i18n-skip],#suggest,#addSuggest,.marq,.tagcloud,.mini-tracks,.dc-tracks,.chip')) return NodeFilter.FILTER_REJECT;
      return norm(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const key = norm(n.nodeValue); const tr = dict[key];
    if (tr) n.nodeValue = n.nodeValue.replace(key, tr);
  }
  for (const attr of ['placeholder', 'aria-label', 'title']) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => { const v = norm(el.getAttribute(attr)); if (dict[v]) el.setAttribute(attr, dict[v]); });
  }
  root.querySelectorAll('.final-title').forEach((n) => { if (!n.id && dict.final_h2) n.innerHTML = dict.final_h2; });
}
