# Let's explain

Interactive courses that explain software technologies with live, step-by-step scenes. Every course is available in Turkish and English.

Every lesson follows the same rhythm:

- **Watch:** each step the scene shows something happening, such as where a message goes or what happens when a service crashes.
- **Predict:** on some steps the scene pauses and asks for your guess first, then plays what really happens.
- **Try:** every lesson ends with missions. You build and break the system yourself with buttons; the fewer moves you need, the more stars you earn.

## Courses

| Course | Status |
|---|---|
| Apache Kafka | 20 lessons in 7 chapters |
| Git | 19 lessons in 6 chapters, each with the real commands to use in your own project |
| RabbitMQ | 17 lessons in 5 chapters, with commands and Python code to set it up in your own project |
| Kubernetes, database transactions | Planned |

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simulation and mission tests
npm run build      # static site in dist/
```

The site is plain static files with hash routes (`#/kafka/log-and-offset/3`), so it runs on any static host, GitHub Pages included.

## Layout

```text
packages/core/     shared by every course
  components/      lesson player, predictions, mission panel, recap and quiz
  course/          Course and Lesson types, the course context
  iso/             isometric drawing pieces (boxes, belts, characters, buildings)
  i18n/            TR/EN text helpers
  lib/             routing, progress storage, animation timers
  styles/          colours, fonts, global styles
courses/kafka/     the Kafka course
  engine/          a small, deterministic Kafka model that runs in the browser
  iso/             Kafka-specific scenes (partition belts, brokers, segments)
  lessons/<slug>/  one folder per lesson: text, scene, model, missions, tests
courses/git/       the Git course
  engine/          a small Git model whose object ids match real Git (tested against git itself)
  iso/             the commit graph and the three areas
  lessons/<slug>/  one folder per lesson
courses/rabbitmq/  the RabbitMQ course
  engine/          a small broker model: exchanges, bindings, queues, acks, prefetch,
                   dead letters, TTL, quorum queues and streams
  iso/             the broker stage: producers, exchanges, queues and consumers
  lessons/<slug>/  one folder per lesson
site/              the hub listing every course, and the app shell
```

Courses never import each other; they all build on `@lets-explain/core`. Progress and stars are kept in the browser, under separate keys per course.

## Writing a lesson

Inside `courses/<course>/src/lessons/<slug>/`:

| File | What it holds |
|---|---|
| `lesson.ts` | The steps (TR + EN), prediction questions, recap and quiz. Exports a single `Lesson`; the course finds it by slug. |
| `model.ts` | The lesson's small, deterministic simulation. The same moves always give the same result. |
| `Scene.tsx` | The scene: takes `step` and draws that moment. The last step is the try-it area with missions. |
| `missions.ts` | Missions: goal, hint, and the moves needed for three stars (`par`). |
| `missions.test.ts` | Proves each mission can be won in exactly `par` moves, and that no shorter win exists, by trying every move sequence. |
| `terms.ts` | Optional: glossary entries for terms written as `[[term]]` in the text. |

A step can also carry `practice`: the real commands for what it showed, shown as an "In your project" terminal card with copy buttons.

Lesson text supports `**bold**`, `` `code` ``, `[[term]]` and `[[term|shown text]]`.

## Adding a course

1. Export a `Course` from `courses/<course>/src/index.ts`: name, tagline, chapters, glossary and a home-page scene. See `courses/kafka/src/index.ts`.
2. Add the `@lets-explain/<course>` alias to `tsconfig.json` and `vite.config.ts`.
3. Add the course to the `courses` list in `site/src/catalog.ts`, and remove it from `planned`.

## Accuracy

The simulations are simplified for teaching, and every simplification is called out in the lesson with an "In reality" note. If you spot a mistake, please open an issue.
