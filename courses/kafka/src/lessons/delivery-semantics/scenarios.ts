import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import type { AppCtx } from "../shared/appShell";
import { crash, duplicateCount, lagOf, lostOffsets, produce, run, sandboxStart, type DAction, type DEvent, type DState } from "./model";
import { boxOf, CODE, COMMIT_FIRST, readLoop, SEND_FIRST, SEND_FIRST_DEDUPE, type DBox } from "./shell";

export type DCtx = AppCtx<DState, DAction, DEvent>;
export type DScenario = Scenario<DCtx, DBox>;

const after = (actions: DAction[], from = sandboxStart) => run(actions, from).states.at(-1)!;

const lostSince = (c: DCtx) => lostOffsets(c.state).length - lostOffsets(c.start).length;
const dupsSince = (c: DCtx) => duplicateCount(c.state) - duplicateCount(c.start);
const settled = (c: DCtx) => c.state.alive && lagOf(c.state) === 0 && lostSince(c) === 0;
const loopOf = (c: DCtx) => readLoop(c.box.files[CODE]);
const sendsFirst = (c: DCtx) => {
  const o = loopOf(c)?.order ?? [];
  return o.indexOf("send") !== -1 && o.indexOf("send") < o.lastIndexOf("commit");
};

/** Free play: the email service as the lesson left it, committing first. */
export const FREE: DBox = boxOf(sandboxStart, COMMIT_FIRST);

export const scenarios: DScenario[] = [
  {
    id: "lost-email",
    title: l("Kayıp e-posta", "The lost email"),
    story: l(
      "Dün gece sunucu yeniden başlarken bir müşteri sipariş e-postasını hiç almadı. `email_consumer.py`'a bak: önce commit ediyor, sonra e-postayı gönderiyor. Bu gece bir deploy daha var ve servisi yine yarıda kesecek.",
      "Last night the server restarted mid-run and a customer never got their order email. Look at `email_consumer.py`: it commits first, then sends. There's another deploy tonight, and it will cut the service off again.",
    ),
    goal: l(
      "Kodu, çökme hiçbir e-postayı **kaybettiremeyecek** şekilde düzelt; bekleyen siparişin e-postası gitsin, servis çalışır ve lag 0 olsun.",
      "Fix the code so a crash can **never lose** an email; the waiting order gets its email, the service is running and lag is 0.",
    ),
    start: boxOf(sandboxStart, COMMIT_FIRST, "commit"),
    hints: [
      l("Commit \"bu kaydı bitirdim\" demek. İş bitmeden söylersen ve o an çökersen, kayıt bir daha okunmaz.", "A commit says \"I'm done with this record\". Say it before the work is done, crash right then, and the record is never read again."),
      l("`nano email_consumer.py` ile `send_email` satırını `consumer.commit` satırının üstüne al, sonra servisi başlat. Deploy onu keserse yeniden başlat.", "With `nano email_consumer.py`, move the `send_email` line above `consumer.commit`, then start the service. If the deploy kills it, start it again."),
      l("`nano email_consumer.py` (send_email önce, commit sonra), `python email_consumer.py`, `python email_consumer.py`", "`nano email_consumer.py` (send_email first, commit after), `python email_consumer.py`, `python email_consumer.py`"),
    ],
    par: 3,
    check: (c) => settled(c) && dupsSince(c) === 0 && sendsFirst(c) && Object.keys(c.state.sent).length > Object.keys(c.start.sent).length,
  },
  {
    id: "double-email",
    title: l("Çift e-posta", "Two emails"),
    story: l(
      "Kod artık önce gönderiyor, sonra commit ediyor: hiçbir e-posta kaybolmuyor. Ama deploy sırasında yeniden başlayan servis, müşterilere aynı e-postayı iki kez yolluyor. `mailer` modülünde gönderilenleri tutan `already_sent()` var.",
      "The code now sends first and commits after: no email gets lost. But when a deploy restarts the service, customers get the same email twice. The `mailer` module has `already_sent()`, which checks the list of sent emails.",
    ),
    goal: l(
      "Deploy servisi yine kessin, ama bekleyen siparişin müşterisi **tek** e-posta alsın; sonunda servis çalışsın, lag 0 olsun.",
      "Let the deploy cut the service off again, but the waiting order's customer gets **one** email; in the end the service runs and lag is 0.",
    ),
    start: boxOf(sandboxStart, SEND_FIRST, "send"),
    hints: [
      l("Gönderdikten sonra, commit etmeden çökerse kayıt yeniden okunur. Tekrarı engelleyemezsin; tekrarı **zararsız** yapabilirsin.", "Crash after sending but before committing, and the record is read again. You can't stop the repeat; you can make it **harmless**."),
      l("Göndermeden önce `already_sent(msg.value())` ile bak: `if not already_sent(...)` gönderimi korusun.", "Check `already_sent(msg.value())` before sending: let `if not already_sent(...)` guard the send."),
      l(
        "`nano email_consumer.py` ile `send_email` satırını `if not already_sent(msg.value()):` altına al, sonra `python email_consumer.py` iki kez",
        "`nano email_consumer.py`: put `send_email` under `if not already_sent(msg.value()):`, then `python email_consumer.py` twice",
      ),
    ],
    par: 3,
    check: (c) => settled(c) && dupsSince(c) === 0 && c.state.skips > c.start.skips && sendsFirst(c),
  },
  {
    id: "back-up",
    title: l("Geri ayağa kaldır", "Back on its feet"),
    story: l(
      "Gece servis çöktü ve kimse fark etmedi. Sabah iki sipariş daha geldi. Kod doğru sırada (önce gönder, sonra commit).",
      "The service crashed overnight and nobody noticed. Two more orders came in this morning. The code is in the right order (send, then commit).",
    ),
    goal: l("Bekleyen bütün siparişlerin e-postası gitsin, servis çalışsın, **lag 0** olsun.", "Every waiting order gets its email, the service runs, and **lag is 0**."),
    start: boxOf(after([produce, crash]), SEND_FIRST),
    hints: [
      l("Önce ne kadar geride olduğuna bak: `kafka-consumer-groups.sh` ile group'u describe et.", "First see how far behind it is: describe the group with `kafka-consumer-groups.sh`."),
      l("Servis, commit ettiği offset'ten devam eder. Sadece başlatman yeter.", "The service carries on from its committed offset. Starting it is enough."),
      l("`python email_consumer.py`", "`python email_consumer.py`"),
    ],
    par: 1,
    check: (c) => settled(c) && dupsSince(c) === 0,
  },
  {
    id: "at-most-once",
    title: l("Bilerek at-most-once", "At-most-once on purpose"),
    story: l(
      "Bu servis artık \"kargon yola çıktı\" bildirimi gönderecek. Ürün ekibi net: bir bildirimin kaybolması sorun değil, ama **aynı bildirimin iki kez** gitmesi şikâyet getiriyor. Bu gece de bir deploy var.",
      "This service will now send \"your parcel is on its way\" notices. The product team is clear: a lost notice is fine, but the **same notice twice** brings complaints. There's a deploy tonight too.",
    ),
    goal: l("Deploy servisi kessin, ama **hiçbir** bildirim iki kez gitmesin; sonunda servis çalışsın, lag 0 olsun.", "Let the deploy cut the service off, but **no** notice goes out twice; in the end the service runs and lag is 0."),
    start: boxOf(sandboxStart, SEND_FIRST, "send"),
    hints: [
      l("Önce gönderip sonra commit etmek tekrar riski taşır. Burada tekrar kayıptan daha kötü.", "Sending first and committing after risks a repeat. Here a repeat is worse than a loss."),
      l("Commit'i göndermeden önceye al: at-most-once.", "Move the commit before the send: at-most-once."),
      l("`nano email_consumer.py` (commit önce, send_email sonra), `python email_consumer.py`, `python email_consumer.py`", "`nano email_consumer.py` (commit first, send_email after), `python email_consumer.py`, `python email_consumer.py`"),
    ],
    par: 3,
    check: (c) => {
      const o = loopOf(c)?.order ?? [];
      return c.state.alive && lagOf(c.state) === 0 && dupsSince(c) === 0 && o.indexOf("commit") !== -1 && o.indexOf("commit") < o.indexOf("send") && c.actions.some((a) => a.type === "crash");
    },
  },
];

export { CODE, COMMIT_FIRST, SEND_FIRST, SEND_FIRST_DEDUPE };
