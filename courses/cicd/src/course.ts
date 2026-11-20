import { l } from "@lets-explain/core/i18n";
import type { Chapter, Lesson, LessonEntry } from "@lets-explain/core/course/types";

/** Lessons live in `lessons/<slug>/lesson.ts` and are picked up here by slug. */
const modules = import.meta.glob<Record<string, unknown>>("./lessons/*/lesson.ts", { eager: true });
const written = new Map<string, Lesson>();
for (const mod of Object.values(modules)) {
  for (const value of Object.values(mod)) {
    if (value && typeof value === "object" && "slug" in value && "steps" in value) {
      const lesson = value as Lesson;
      written.set(lesson.slug, lesson);
    }
  }
}

const entry = (slug: string, tr: string, en: string): LessonEntry => {
  const lesson = written.get(slug);
  return lesson ? { slug, title: lesson.title, lesson } : { slug, title: l(tr, en) };
};

export const chapters: Chapter[] = [
  {
    id: "foundations",
    title: l("Temeller", "Foundations"),
    lessons: [
      entry("why-ci-cd", "CI/CD neden var?", "Why CI/CD?"),
      entry("ci-vs-cd", "CI, Delivery ve Deployment", "CI, Delivery and Deployment"),
      entry("pipeline-anatomy", "Bir pipeline'ın parçaları", "The parts of a pipeline"),
    ],
  },
  {
    id: "first-pipeline",
    title: l("İlk pipeline", "Your first pipeline"),
    lessons: [
      entry("workflow-file", "Workflow dosyası", "The workflow file"),
      entry("triggers", "Tetikleyiciler", "Triggers"),
      entry("fresh-runners", "Her job temiz bir makinede", "Every job gets a fresh machine"),
    ],
  },
  {
    id: "quality",
    title: l("Kalite kontrolü", "Checking quality"),
    lessons: [
      entry("lint-test-build", "Lint, test, build", "Lint, test, build"),
      entry("pr-checks", "PR check'leri ve branch protection", "PR checks and branch protection"),
      entry("reading-failures", "Kırık bir pipeline'ı okumak", "Reading a broken pipeline"),
    ],
  },
  {
    id: "speed",
    title: l("Hız", "Speed"),
    lessons: [
      entry("parallel-and-matrix", "Paralel job'lar ve matrix", "Parallel jobs and matrix"),
      entry("caching", "Cache", "Caching"),
      entry("artifacts", "Artifact'ler", "Artifacts"),
    ],
  },
  {
    id: "tricks",
    title: l("Küçük numaralar", "Small tricks"),
    lessons: [
      entry("path-filters", "Sadece değişen kod için çalıştır", "Run only for what changed"),
      entry("reusable-workflows", "Ortak kodu tek yerde topla", "Keep shared steps in one place"),
      entry("conditions-and-outputs", "Koşullar ve çıktılar", "Conditions and outputs"),
      entry("no-wasted-runs", "Boşuna çalışmayı engelle", "Stop wasted runs"),
    ],
  },
  {
    id: "security",
    title: l("Güvenlik", "Security"),
    lessons: [
      entry("secrets", "Secret'lar", "Secrets"),
      entry("least-privilege", "En az yetki", "Least privilege"),
    ],
  },
  {
    id: "delivery",
    title: l("Teslim (CD)", "Delivery (CD)"),
    lessons: [
      entry("build-once", "Bir kez build et", "Build once"),
      entry("environments", "Ortamlar ve onaylar", "Environments and approvals"),
      entry("deploy-strategies", "Deploy stratejileri", "Deploy strategies"),
      entry("rollback", "Geri almak", "Rolling back"),
      entry("after-deploy", "Deploy'dan sonra", "After the deploy"),
    ],
  },
  {
    id: "practice",
    title: l("Pratikte", "In practice"),
    lessons: [entry("your-pipeline", "Kendi pipeline'ını yaz", "Write your own pipeline")],
  },
];
