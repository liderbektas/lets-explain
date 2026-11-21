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
    id: "realtime",
    title: l("Neden gerçek zamanlı?", "Why real time?"),
    lessons: [entry("polling", "Polling ve long polling", "Polling and long polling"), entry("sse-and-websocket", "SSE ve WebSocket", "SSE and WebSocket")],
  },
  {
    id: "opening",
    title: l("Bağlantının kurulması", "Opening the connection"),
    lessons: [entry("handshake", "El sıkışma", "The handshake"), entry("key-and-accept", "Key ve Accept", "Key and Accept")],
  },
  {
    id: "frames",
    title: l("Frame'ler", "Frames"),
    lessons: [entry("frames", "Frame'in anatomisi", "Anatomy of a frame"), entry("masking-and-fragments", "Mask ve parçalı mesajlar", "Masking and fragments")],
  },
  {
    id: "lifecycle",
    title: l("Bağlantının ömrü", "A connection's life"),
    lessons: [entry("heartbeat", "Ping/pong ve heartbeat", "Ping/pong and heartbeats"), entry("closing", "Kapanış ve close kodları", "Closing and close codes")],
  },
  {
    id: "server",
    title: l("Sunucu tarafı", "The server side"),
    lessons: [
      entry("first-server", "İlk sunucu", "Your first server"),
      entry("rooms", "Yayın ve odalar", "Broadcast and rooms"),
      entry("backpressure", "Backpressure", "Backpressure"),
    ],
  },
  {
    id: "real-world",
    title: l("Gerçek dünya", "In the real world"),
    lessons: [
      entry("reconnect", "Yeniden bağlanma", "Reconnecting"),
      entry("missed-messages", "Kaçan mesajlar", "Missed messages"),
      entry("behind-nginx", "nginx arkasında WebSocket", "WebSocket behind nginx"),
    ],
  },
  {
    id: "scale",
    title: l("Ölçekleme ve güvenlik", "Scale and security"),
    lessons: [entry("many-servers", "Birden fazla sunucu", "Many servers"), entry("security", "Güvenlik", "Security")],
  },
];
