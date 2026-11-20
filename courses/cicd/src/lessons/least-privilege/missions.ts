import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { Ctx } from "../shared/SimScene";
import type { LP, LpAction, LpEvent } from "./model";

export type LpCtx = Ctx<LP, LpAction, LpEvent>;

const hit = (s: LP) => s.tampered || s.runs.some((r) => r.attack?.registry);
const published = (s: LP) => s.runs.some((r) => r.publish === "pushed");

export const missions: Mission<LpCtx>[] = [
  {
    id: "contain",
    title: l("Zararı önle", "Stop the damage"),
    goal: l(
      "`v1` etiketi gizlice kötü koda taşındı. Bir push yap: image yayınlansın ama ne main'e ne registry'ye kötü bir şey girsin.",
      "The `v1` tag was quietly moved to bad code. Push once: the image is published, and nothing bad reaches main or the registry.",
    ),
    hint: l("İki yol var: hangi kodun çalışacağını sabitle, ya da kötü kodun eline geçecek token'ı zayıflat.", "Two ways: fix which code runs, or weaken the token the bad code would get."),
    par: 2,
    check: ({ state }) => published(state) && !hit(state),
  },
  {
    id: "both-locks",
    title: l("İki kilit birden", "Both locks"),
    goal: l(
      "Action'ı SHA'ya sabitle **ve** job başına en az yetkiyi ver; sonra bu ayarlarla temiz bir run'da image yayınlansın.",
      "Pin the action to a SHA **and** give each job the least rights; then a clean run with those settings publishes the image.",
    ),
    hint: l("Biri tutmazsa diğeri tutar: ikisini birden kur.", "If one fails, the other holds: set up both."),
    par: 3,
    check: ({ state }) => !hit(state) && state.runs.some((r) => r.pinned && r.perms === "per-job" && r.publish === "pushed"),
  },
  {
    id: "too-tight",
    title: l("Fazla sıkı", "Too tight"),
    goal: l("Bir run'da `publish` job'ı yetkisizlikten **reddedilsin**: neden her şeyi salt okunur yapamadığımızı gör.", "Get a run where the `publish` job is **denied** for lack of rights: see why we cannot make everything read-only."),
    hint: l("Bütün workflow'u salt okunur yap.", "Make the whole workflow read-only."),
    par: 2,
    check: ({ state }) => state.runs.some((r) => r.publish === "denied"),
  },
];
