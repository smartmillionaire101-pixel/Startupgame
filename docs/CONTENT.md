# Adding content

How to add ideas, events, venues, decisions, features and other content without rewriting game code (blueprint §13 Phase 9, "content pipeline"). Content lives in data files in `packages/engine/src/data/`. The systems read those files, so most additions are a new entry in a list.

## Rules for every addition

- **Amounts are relative.** Costs are written in cost-of-living units (`costCol`) or as shares of payroll, so one entry costs about the same share of a player's means in every city. Thresholds that are dollar goals (`*Usd`) are converted per city. Never write a naira or pound amount into shared content.
- **Ids are permanent.** Saved worlds and command logs refer to ids (`tutor-match`, `big-prospect`, `analytics`). Add new ids; never rename or reuse an old one. To retire an entry, stop offering it but keep it readable.
- **Determinism.** Content is picked with the world's seeded random streams (`deriveRng`), never `Math.random`. Adding an entry to a list can change which entry a seed picks, so changes that alter *existing* play (not just add options) need a release note (`packages/engine/src/releases.ts`, ADR 0001).
- **Words in two languages.** The client translates every `t('…')` string through `apps/web/src/i18n/fr/*.ts`, and `apps/web/test/i18n.test.ts` fails if one is missing or if two screens translate the same English differently. English that comes from the engine and is shown with `tx(…)` (names, generated sentences) is translated when a French entry exists, and shown in English otherwise.
- **Tests.** Run `npm run check` (format, lint, typecheck, unit tests) and the end-to-end specs for the screens you touched (`npm run e2e -w @runway/web -- <spec>`).

## Where each kind of content lives

| Content | File | What to add | Also touch |
| --- | --- | --- | --- |
| Starting ideas (the café, Founder Journey 6) | `data/ideas.ts` | An entry with attributes 0–1 (demand, competition, build difficulty, capital intensity), industry, revenue model and `fitSkills` | French for its title and pitch |
| Business concepts and industries | `data/industries.ts` (industries and their customer segment templates) | An industry with its segments, needs and budgets | Roadmap features for it; French for its name |
| Product features (the roadmap) | `data/roadmap.ts` | A feature per industry: effort, skill, `costCol`, optional dependency, risk, effect | `featureLabel` in `apps/web/src/screens/Decisions.tsx` if rivals can launch it |
| Decision events | `data/decisions.ts` | A template: family, words, choices and their effects, deadline, cooldown | Its trigger in `decisions.ts` (it reads the world); client wording in `eventTitle` / `choiceCopy` in `Decisions.tsx`, plus French |
| City events players host | `data/events.ts` | An event kind with `costCol`, capacity, venue and outcomes | French for its name |
| Local businesses and venues | `data/businesses.ts`, `data/business-names.ts` | A kind (what it sells, its size, gigs, look) or a seed (a named place in a district) | District ids come from the web's city plans (`apps/web/src/city/plans/`) |
| Backgrounds and lifestyle tiers | `data/characters.ts` | A background card: skills, network, savings multiplier, hours | French for its name, strengths and gaps |
| Quiz questions | `data/quiz-bank.ts` | A row: category, question, four answers, correct index, then the French question and answers | Nothing else |
| Lenders, grants, accelerators | `data/capital.ts`, `data/programs.ts`, `data/tech-capital.ts` | A product or programme per city, with eligibility | French for its name |
| Homes and the shop | `data/property.ts`, `data/lifestyle-shop.ts` | A property type, car or furniture item, priced in `costCol` | French for its name |
| Sky views and landmarks | `data/sky-views.ts`, `data/landmarks.ts` | A viewpoint or landmark with real coordinates | — |
| Chapters (the journey) | `journey.ts` (`CHAPTERS`, thresholds in `JOURNEY`) | A step derived from the world | Its copy in `apps/web/src/city/journey.ts` (`stepCopy`) and French |
| Ambitions (Phase 7) | `ambitions.ts` (`AMBITIONS`, thresholds in `AMBITION`) | A path with steps derived from the world | `ambitionCopy`, `stepCopy` and `AMBITION_ICON` in `apps/web/src/city/journey.ts`, and French |

## Tuning

Balance values live next to the system that uses them, in one exported object per system, so they can be found and changed in one place: `JOURNEY`, `AMBITION`, `SALES`, `HIRING`, `ROADMAP`, `EXITS`, `ALLOCATOR`, `FF` and the per-city data in `data/markets*.ts`. The admin dashboard (`GET /api/admin/economy`) reports the money supply, company survival and the playtest numbers (`playtest`: first-session completion, time to first customer, chapters reached, failures and distress, decisions left to their default, ambitions, and use of the life systems) to check a change against.
