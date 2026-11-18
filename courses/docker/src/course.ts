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
      entry("why-containers", "Neden container?", "Why containers?"),
      entry("images-and-containers", "Image ve container", "Images and containers"),
      entry("architecture", "Docker mimarisi", "How Docker is built"),
      entry("lifecycle", "Container yaşam döngüsü", "The container lifecycle"),
    ],
  },
  {
    id: "commands",
    title: l("Temel komutlar", "Everyday commands"),
    lessons: [
      entry("run-flags", "docker run ve parametreleri", "docker run and its flags"),
      entry("inspect-and-clean", "İncele ve temizle", "Inspect and clean up"),
    ],
  },
  {
    id: "dockerfile",
    title: l("Dockerfile", "Dockerfile"),
    lessons: [
      entry("dockerfile-basics", "Dockerfile temelleri", "Dockerfile basics"),
      entry("cmd-vs-entrypoint", "CMD ve ENTRYPOINT", "CMD and ENTRYPOINT"),
      entry("layers-and-cache", "Layer'lar ve build cache", "Layers and the build cache"),
      entry("multi-stage", "Multi-stage ve küçük image'lar", "Multi-stage and small images"),
    ],
  },
  {
    id: "data-and-network",
    title: l("Veri ve ağ", "Data and networking"),
    lessons: [
      entry("volumes", "Volume ve bind mount", "Volumes and bind mounts"),
      entry("ports", "Port mapping", "Port mapping"),
      entry("networks", "Network'ler ve DNS", "Networks and DNS"),
    ],
  },
  {
    id: "compose",
    title: l("Docker Compose", "Docker Compose"),
    lessons: [
      entry("compose-basics", "Compose temelleri", "Compose basics"),
      entry("compose-stack", "Çok servisli uygulama", "A multi-service app"),
    ],
  },
  {
    id: "registry",
    title: l("Image'lar ve registry", "Images and registries"),
    lessons: [entry("registry-and-tags", "Registry ve tag'ler", "Registries and tags")],
  },
  {
    id: "operations",
    title: l("İşletmek", "Running it"),
    lessons: [
      entry("debugging", "Sorun giderme", "Debugging"),
      entry("security", "Güvenlik temelleri", "Security basics"),
      entry("resources-and-restart", "Kaynaklar ve restart policy", "Resources and restart policies"),
    ],
  },
  {
    id: "practice",
    title: l("Pratikte", "In practice"),
    lessons: [
      entry("dockerize-your-app", "Kendi projeni dockerize et", "Dockerize your own app"),
      entry("dev-prod-and-ci", "Dev, prod ve CI/CD", "Dev, prod and CI/CD"),
      entry("kubernetes-intro", "Kubernetes'e kısa bakış", "A first look at Kubernetes"),
    ],
  },
];
