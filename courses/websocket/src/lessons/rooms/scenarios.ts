import { l } from "@lets-explain/core/i18n";
import { createNet } from "../../engine/net";
import { logsOf, newConns, type WsCtx, type WsScenario } from "../shared/NetScene";
import { BOTS, leaveOld, noCleanup, ROOMS, roomOnly, safeParse, SWITCH } from "./code";

const files = (server: string) => ({ "server.js": server, "bots.js": BOTS, "switch.js": SWITCH });

export const FREE = createNet({ files: files(ROOMS) });

const parse = (text: string) => {
  try {
    return JSON.parse(text) as { type?: string; room?: string; text?: string };
  } catch {
    return null;
  }
};

/** Which room a connection asked for last, and the chats it received. */
const joined = (c: WsCtx["state"]["conns"][number]) => c.msgs.filter((m) => m.dir === "out").map((m) => parse(m.text)).filter((m) => m?.type === "join").at(-1)?.room;
const chats = (c: WsCtx["state"]["conns"][number]) => c.msgs.filter((m) => m.dir === "in").map((m) => ({ at: m.at, msg: parse(m.text) })).filter((x) => x.msg?.type === "chat");

const switchConn = (ctx: WsCtx) => newConns(ctx).find((c) => c.client.startsWith("proc:") && c.msgs.some((m) => m.dir === "out" && m.text.includes('"ops"')) && c.msgs.some((m) => m.dir === "out" && m.text.includes('"genel"')));

export const scenarios: WsScenario[] = [
  {
    id: "room-only",
    title: l("Oda dışına sızmasın", "Keep it in the room"),
    story: l(
      "Odalı sohbet sunucusu yayında, ama #ops'taki Mert, #genel'deki her mesajı da görüyor. `bots.js` Ayşe'yi #genel'e, Mert'i #ops'a sokar ve aldıklarını yazar. Mesaj sadece aynı odadakilere gitmeli.",
      "The chat server with rooms is live, but Mert in #ops sees every message from #genel too. `bots.js` puts Ayşe in #genel and Mert in #ops, and prints what they get. A message should go only to the people in the same room.",
    ),
    goal: l("#genel'e yazdığın mesaj Ayşe'ye gitsin, Mert'e gitmesin.", "A message you write in #genel reaches Ayşe, not Mert."),
    start: FREE,
    hints: [
      l(
        "`rooms` bir Map: oda adı → o odadaki soketler. Sohbet mesajını `wss.clients` yerine `rooms.get(ws.room)` içindekilere gönder.",
        "`rooms` is a Map: room name → the sockets in that room. Send the chat message to those in `rooms.get(ws.room)` instead of `wss.clients`.",
      ),
      l(
        "Dene: sunucuyu ve botları başlat, `wscat` ile bağlan, önce `{\"type\":\"join\",\"room\":\"genel\"}`, sonra `{\"type\":\"chat\",\"text\":\"...\"}`.",
        "Try it: start the server and the bots, connect with `wscat`, send `{\"type\":\"join\",\"room\":\"genel\"}` and then `{\"type\":\"chat\",\"text\":\"...\"}`.",
      ),
      l(
        "`nano server.js` (`for (const client of rooms.get(ws.room) ?? []) client.send(out);`), `node server.js &`, `node bots.js &`, `wscat -c ws://localhost:9001`, join, chat",
        "`nano server.js` (`for (const client of rooms.get(ws.room) ?? []) client.send(out);`), `node server.js &`, `node bots.js &`, `wscat -c ws://localhost:9001`, join, chat",
      ),
    ],
    par: 6,
    check: (ctx) => {
      const me = newConns(ctx).filter((c) => c.client === "you");
      const mine = me.flatMap((c) => c.msgs.filter((m) => m.dir === "out").map((m) => parse(m.text)).filter((m) => m?.type === "chat").map((m) => m!.text!));
      if (!me.some((c) => joined(c) === "genel") || !mine.length) return false;
      const bots = newConns(ctx).filter((c) => c.client.startsWith("proc:"));
      const got = (room: string) => bots.filter((b) => joined(b) === room).some((b) => chats(b).some((x) => mine.includes(x.msg!.text!)));
      return got("genel") && !got("ops");
    },
  },
  {
    id: "bad-json",
    title: l("Tek bir hatalı mesaj", "One bad message"),
    story: l(
      "Gece sohbet sunucusu çöktü ve herkesin bağlantısı koptu. Loglarda bir `SyntaxError` var: bir istemci JSON olmayan bir şey göndermiş. Tek bir hatalı mesaj tüm sunucuyu düşürmemeli; gönderene bir hata mesajı dönmeli.",
      "Last night the chat server crashed and everyone was cut off. The logs show a `SyntaxError`: a client sent something that wasn't JSON. One bad message must not take the whole server down; the sender should get an error back.",
    ),
    goal: l("JSON olmayan bir mesaja sunucu `{\"type\":\"error\",...}` ile cevap versin ve çalışmaya devam etsin.", "The server answers a non-JSON message with `{\"type\":\"error\",...}` and keeps running."),
    start: createNet({ files: files(roomOnly(ROOMS)) }),
    hints: [
      l(
        "`message` olayının içinde fırlayan bir hata yakalanmazsa Node süreci biter. `JSON.parse`'ı `try { ... } catch { ... }` içine al.",
        "An error thrown inside the `message` handler and not caught ends the Node process. Put `JSON.parse` inside `try { ... } catch { ... }`.",
      ),
      l("`catch` içinde gönderene bir hata mesajı yolla ve `return` et. Sonra sunucuyu başlatıp JSON olmayan bir şey gönder.", "In the `catch`, send the sender an error message and `return`. Then start the server and send something that isn't JSON."),
      l(
        "`nano server.js` (try/catch), `node server.js &`, `wscat -c ws://localhost:9001 -x hello`",
        "`nano server.js` (try/catch), `node server.js &`, `wscat -c ws://localhost:9001 -x hello`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const p = ctx.state.procs.find((x) => x.file === "server.js" && x.alive);
      return Boolean(p) && newConns(ctx).some((c) => c.client === "you" && c.msgs.some((m) => m.dir === "out" && !parse(m.text)) && c.msgs.some((m) => m.dir === "in" && parse(m.text)?.type === "error"));
    },
  },
  {
    id: "switch-rooms",
    title: l("Oda değiştir", "Switch rooms"),
    story: l(
      "#genel'den #ops'a geçen kullanıcılar #genel'in mesajlarını almaya devam ediyor. `switch.js` bunu test eder: #genel'e girer, bir saniye sonra #ops'a geçer ve 12 sn boyunca aldığı her şeyi yazar. Ayşe #genel'de 5 sn'de bir yazıyor.",
      "Users who move from #genel to #ops keep getting #genel's messages. `switch.js` tests that: it joins #genel, moves to #ops a second later, and prints everything it gets for 12 s. Ayşe writes in #genel every 5 s.",
    ),
    goal: l("#ops'a geçen `switch.js`, #genel'den bir daha mesaj almasın.", "Once `switch.js` has moved to #ops, it gets no more messages from #genel."),
    start: createNet({ files: files(safeParse(roomOnly(ROOMS))) }),
    hints: [
      l("`join` gelince soket yeni odanın kümesine ekleniyor ama eski odanın kümesinden hiç çıkarılmıyor.", "On `join`, the socket is added to the new room's set but never removed from the old room's set."),
      l(
        "`ws.room = msg.room;` satırından önce: `if (ws.room) rooms.get(ws.room).delete(ws);`. Sonra sunucuyu ve botları başlatıp `node switch.js`.",
        "Before the line `ws.room = msg.room;`: `if (ws.room) rooms.get(ws.room).delete(ws);`. Then start the server and the bots, and run `node switch.js`.",
      ),
      l("`nano server.js`, `node server.js &`, `node bots.js &`, `node switch.js`", "`nano server.js`, `node server.js &`, `node bots.js &`, `node switch.js`"),
    ],
    par: 4,
    check: (ctx) => {
      const c = switchConn(ctx);
      if (!c) return false;
      const movedAt = c.msgs.find((m) => m.dir === "out" && m.text.includes('"ops"'))!.at;
      // Ayşe did speak in #genel after the move, and none of it reached the switcher.
      const genelTalk = newConns(ctx).some((b) => b !== c && joined(b) === "genel" && b.msgs.some((m) => m.dir === "out" && m.at > movedAt && parse(m.text)?.type === "chat"));
      return genelTalk && c.closedAt !== null && !chats(c).some((x) => x.at > movedAt && x.msg!.room === "genel");
    },
  },
  {
    id: "cleanup",
    title: l("Ayrılanı unutma", "Forget those who left"),
    story: l(
      "Sunucunun belleği günden güne artıyor ve loglardaki oda sayıları tutmuyor: herkes ayrıldığı halde \"ops: 2 members\" yazıyor. Kapanan bağlantılar odalardan hiç silinmiyor. `switch.js`'i iki kez arka arkaya çalıştırarak bunu görebilirsin.",
      "The server's memory grows day by day and the room counts in the logs don't add up: it says \"ops: 2 members\" though everyone left. Closed connections are never removed from their rooms. Running `switch.js` twice in a row shows it.",
    ),
    goal: l("Bağlantı kapanınca odasından silinsin: ikinci `switch.js` #ops'a girdiğinde log \"ops: 1 members\" desin.", "A closed connection is removed from its room: when the second `switch.js` enters #ops, the log says \"ops: 1 members\"."),
    start: createNet({ files: files(noCleanup(leaveOld(safeParse(roomOnly(ROOMS))))) }),
    hints: [
      l("Her soketin bir `close` olayı var. Orada soketi `rooms.get(ws.room)` kümesinden sil.", "Every socket has a `close` event. Remove the socket from `rooms.get(ws.room)` there."),
      l("Sunucuyu başlat, `node switch.js`'i iki kez çalıştır ve logdaki üye sayısına bak.", "Start the server, run `node switch.js` twice, and look at the member count in the log."),
      l(
        "`nano server.js` (`ws.on(\"close\", () => { if (ws.room) rooms.get(ws.room).delete(ws); });`), `node server.js &`, `node switch.js`, `node switch.js`",
        "`nano server.js` (`ws.on(\"close\", () => { if (ws.room) rooms.get(ws.room).delete(ws); });`), `node server.js &`, `node switch.js`, `node switch.js`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const ops = logsOf(ctx).filter((t) => /^ops: \d+ members$/.test(t));
      return ops.length >= 2 && ops.at(-1) === "ops: 1 members";
    },
  },
];
