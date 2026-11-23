import { l, type L, type Lang } from "@lets-explain/core/i18n";
import type { ExchangeEnd } from "../../engine/net";
import type { PhoneStageLabels } from "../../iso/PhoneStage";
import { stageLabels } from "./NetScene";

const ENDED: Record<ExchangeEnd, L> = {
  done: l("akış bitti", "stream ended"),
  lost: l("bağlantı koptu", "connection lost"),
  closed: l("akış kapatıldı", "stream closed"),
  clientTimeout: l("curl süre dolunca bıraktı", "curl let go at its time limit"),
  sandboxStop: l("akış durduruldu", "stream stopped"),
  refused: l("bağlantı reddedildi", "connection refused"),
  dropped: l("bağlantı koptu", "connection dropped"),
};

/** Labels for the phone-and-rack stage. */
export function phoneLabels(t: (x: L) => string, lang: Lang, client: L): PhoneStageLabels {
  return {
    ...stageLabels(t, lang, client),
    sse: t(l("SSE akışı: sadece sunucudan istemciye", "SSE stream: server to client only")),
    ws: t(l("WebSocket: tek bağlantı, iki yön", "WebSocket: one connection, both ways")),
    offline: t(l("Wi-Fi yok", "No Wi-Fi")),
    ended: (end) => t(ENDED[end]),
    wsClosed: (code) => `${t(l("WebSocket kapandı", "WebSocket closed"))} · ${code}`,
    nothingNew: t(l("yeni yok", "nothing new")),
  };
}
