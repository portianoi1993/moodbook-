# MoodBook — аудит скілів (5 вересня 2026)

Просканував усі **232** встановлені скіли (`~/.claude/skills` і `MoodBook/.claude/skills`): назва, опис, розділи «Use when / Visual target». Нижче вердикт для кожної групи і що саме пішло в роботу над дизайном «Nocturne».

## 1. Застосовано в дизайні «Nocturne» (v3)

| Скіл | Що взято |
|---|---|
| **ui-ux-pro-max** | Згенеровано дизайн-систему (`design-system/moodbook/MASTER.md`): стиль «Modern Dark (Cinema)», палітра «night indigo + dream violet», ефекти (ambient light, glass nav, scale press .97, avoid pure #000), motion-пресети (stagger, magnetic hover з clamp), UX-чекліст. Шрифтову рекомендацію Inter відхилено на користь soft-skill. |
| **soft-skill** (Vanguard UI Architect) | Архетип «Ethereal Glass», layout «Editorial Split» для героя, double-bezel (оболонка + ядро), «button-in-button» CTA з вкладеною стрілкою, island-nav (плаваюча glass-пігулка), blur-rise reveals, заборона Inter/Roboto, лінійних transitions, суцільних сірих бордерів. |
| **glass-dark-ui**, **css-border-gradient** | Токени темного скла, masked gradient border (`.gborder::before`), правила читабельності на склі. |
| **mesh-gradient-dark-blue-clean**, **atmosphere-background** | Canvas light-field у hero-оболонці: 4 повільні кольорові орби + вертикальні світлові складки, half-res рендер, пауза поза екраном. |
| **animation-systems**, **emil-design-eng**, **animate** | Хореографія (заголовок → підзаголовок → форма → картка), custom cubic-bezier, ≤300 мс для UI, натискання .97, transform/opacity only, reduced-motion. |
| **staggered-word-reveal**, **masked-reveal** | Заголовок героя відкривається словами через маску (доступна назва збережена). |
| **reveal-hover-effect** (ідея) | Spotlight, що йде за курсором по glass-картках (`[data-spot]`). |
| **marquee-loop**, **css-alpha-masking** | Стрічка назв книг із маскованими краями. |
| **redesign-skill** | Аудит AI-штампів попередньої версії: три однакові картки, пласкі площини, теплі сірі, «paper»-кліше. |
| **web-design-guidelines**, **optimize-web-animations** | aria, focus-visible, min 44px, backdrop-filter лише на fixed/sticky, DPR cap для canvas, pause on hidden. |
| **landing-page**, **pricing-page**, **cro**, **stop-slop** | Порядок секцій, дві чесні тарифні картки з виділенням Pro, FAQ як заперечення, копірайт без штампів. |
| **brandkit** (принципи) | Нове лого: одна метафора «сторінки = еквалайзер», знак у squircle з градієнтом бренду, версії 32/180/192/512, SVG для UI. |

## 2. Підходять далі (не зроблено зараз)

| Скіл | Для чого |
|---|---|
| cinematic-gsap-lenis-motion-system, gsap-scrolltrigger, scroll-scrubbed-word-reveal | Якщо захочеться scroll-story на лендингу (GSAP + Lenis). Зараз усе на CSS/IO, щоб не тягнути бібліотеки. |
| unicorn-studio, vantajs, webgl-laser, dither-background, globe-particles | Заміна canvas-атмосфери на WebGL-сцену в героі. |
| thinking-orbs, beam-glow-states, liquid-metal-border | React-пакети; у vanilla зроблено CSS-аналоги (glow-стан, gradient border). |
| image, aura-asset-images, unsplash-asset-images, poster-hero | Reading Card для шерингу (OG-картинка) і візуали для соцмереж. |
| prototype | Кілька варіантів героя за пікером, коли треба обрати між напрямами. |
| taste | Потребує Playwright MCP; для аналізу референсів конкурентів. |
| design (canvas), design-brief, reference-design-contract | Формальний бриф і артборди, якщо дизайн треба узгоджувати з кимось ще. |
| seo-audit, ai-seo, schema, programmatic-seo | Після релізу: JSON-LD уже є, далі FAQ-схема, сторінки «soundtrack for X». |
| launch, social, marketing-plan, referrals, community-marketing | Reddit/BookTok-запуск за roadmap. |
| paywalls, signup, onboarding, churn-prevention | Коли зʼявляться Supabase-акаунти та оплата. |
| analytics | Мінімальна аналітика подій перед маркетингом. |

## 3. Не для MoodBook

Ігрові (build-*-game, threejs-enemy, fog-of-war, tune-enemy-ai), agent/harness-інженерія (context-*, memory-systems, multi-agent-patterns, harness-engineering, tool-design, evaluation), продажі B2B (cold-email, prospecting, revops, sales-enablement), відео/озвучка (remotion, elevenlabs-tts, video), стилі, що суперечать напряму (brutalist, documentary-brutalist, minimalist light, clean-minimal-beige, light-mode-paper, editorial-service-booking, orange-clean-paper-saas, book-serif-index, skeuomorphic), Shopify/Notion/Slack-плагіни, X/Twitter-письмо.

## 4. Висновок

Основний двигун напряму: **ui-ux-pro-max (база) + soft-skill (архітектура компонентів) + glass/mesh/motion-скіли (виконання)**. Це і є «Nocturne»: темне кіно-скло, одна брендова пара кольорів violet→teal, magnetic-кнопки, жива атмосфера в героі, продукт як доказ у першому екрані.
