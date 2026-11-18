import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { duplicateCount, lagOf, lostOffsets, type DAction, type DEvent, type DState } from "./model";

/** What a mission can look at: where the try-it step began, every move made, and what each did. */
export interface SandboxCtx {
  start: DState;
  state: DState;
  actions: DAction[];
  events: DEvent[][];
}

const lostSince = (c: SandboxCtx) => lostOffsets(c.state).length - lostOffsets(c.start).length;
const dupsSince = (c: SandboxCtx) => duplicateCount(c.state) - duplicateCount(c.start);

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "lose",
    title: l("Kayıp e-posta", "The lost email"),
    goal: l(
      "Bekleyen siparişin e-postası **hiç gönderilmesin**, ama servis onu geçmiş saysın.",
      "Make the waiting order's email **never go out**, while the service counts it as done.",
    ),
    hint: l(
      "Okuduktan hemen sonra commit et, e-postayı göndermeden çökert.",
      "Commit right after reading, then crash before sending.",
    ),
    par: 3,
    check: (c) => lostSince(c) > 0,
  },
  {
    id: "twice",
    title: l("Çift e-posta", "Two emails"),
    goal: l(
      "Bir müşteri aynı sipariş için **iki e-posta** alsın.",
      "Make one customer get **two emails** for the same order.",
    ),
    hint: l(
      "E-postayı gönder, commit etmeden çökert. Yeniden başlayan servis nereden okur?",
      "Send the email, crash before committing. Where does the restarted service read from?",
    ),
    par: 6,
    check: (c) => dupsSince(c) > 0,
  },
  {
    id: "safe",
    title: l("Güvenli çökme", "Safe crash"),
    goal: l(
      "Bekleyen siparişi işle, sonra servis çöküp yeniden başlasın. Sonunda **lag 0** olsun; hiçbir e-posta kaybolmasın, hiçbiri iki kez gitmesin.",
      "Handle the waiting order, then let the service crash and restart. In the end **lag is 0**, and no email is lost or sent twice.",
    ),
    hint: l(
      "Doğru sıra: oku, işle, commit. Çökme commit'ten sonra gelirse kimse bir şey kaybetmez.",
      "The right order: read, process, commit. If the crash comes after the commit, nothing is lost.",
    ),
    par: 5,
    check: (c) => {
      if (!c.state.alive || lagOf(c.state) > 0 || lostSince(c) > 0 || dupsSince(c) > 0) return false;
      // The crash must come after something was read, or there was nothing to risk.
      let readSoFar = false;
      return c.actions.some((a, i) => {
        if (a.type === "crash" && readSoFar) return true;
        if (c.events[i]!.some((e) => e.type === "read")) readSoFar = true;
        return false;
      });
    },
  },
  {
    id: "dedupe",
    title: l("Zararsız tekrar", "A harmless repeat"),
    goal: l(
      "Servis bir siparişi işlesin ve commit etmeden çöksün. Kayıt **tekrar işlensin**, ama müşteri yine **tek** e-posta alsın.",
      "The service handles an order and crashes before committing. The record is **processed again**, yet the customer still gets **one** email.",
    ),
    hint: l(
      "Önce \"Gönderilenler defteri\"ni aç. Tekrar gelen siparişi defter yakalar.",
      "Switch on the \"already sent\" list first. It catches the order when it comes again.",
    ),
    par: 7,
    check: (c) => c.state.skips - c.start.skips > 0 && dupsSince(c) === 0,
  },
];
