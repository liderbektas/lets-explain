import { l } from "@lets-explain/core/i18n";
import type { Course } from "@lets-explain/core/course/types";
import { chapters } from "./course";
import { glossary } from "./glossary";
import { WsHero } from "./Hero";

export const websocketCourse: Course = {
  id: "websocket",
  name: "WebSocket",
  tagline: l(
    "Polling, long polling, SSE ve WebSocket: sunucu sana nasıl haber verir? El sıkışmayı, key ve accept'i, frame'leri kendi komutlarınla gör.",
    "Polling, long polling, SSE and WebSocket: how does a server tell you something? See the handshake, the key and accept, and the frames with your own commands.",
  ),
  chapters,
  glossary,
  home: {
    title: [l("WebSocket'i", "Learn WebSocket by"), l("kablonun içinden", "looking inside the wire"), l("izleyerek öğren.", "as it happens.")],
    lead: l(
      "Bir sohbet uygulamasında yeni mesaj anında ekrana düşer. Arada ne olur? Önce tarayıcının durmadan sorduğu yöntemleri, sonra açık kalan bağlantıları sahnede izler; isteği curl ile kendin yazar, el sıkışmayı elle yapar, accept değerini kendin hesaplarsın.",
      "In a chat app a new message lands on screen at once. What happens in between? You watch, on stage, the ways a browser keeps asking and then the connections that stay open; you write the requests yourself with curl, do the handshake by hand, and compute the accept value yourself.",
    ),
    Art: WsHero,
  },
};
