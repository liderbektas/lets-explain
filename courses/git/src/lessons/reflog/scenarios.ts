import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, short, status, type GitAction } from "../../engine/git";
import type { GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commitAll = (message: string): GitAction[] => [{ type: "add", paths: "." }, { type: "commit", message }];

/** The shop project on its first commit. */
export const SHOP = repoAfter([write("README.md", "# Shop"), write("app.js", "showProducts()"), ...commitAll("Initial shop")], createRepo({ author: ADA }));

/* Lost commit: "Add payments" fell off main when a reset meant for unsaved changes went one too far. */
const withPayments = repoAfter([write("payments.js", "pay()"), ...commitAll("Add payments")], SHOP);
export const PAYMENTS = withPayments.branches.main!;
const lostPayments = repoAfter([write("app.js", "showProducts()\nconsole.log('x')"), { type: "reset", target: "HEAD~1", mode: "hard" }], withPayments);

/* Deleted branch: dark-mode held the only copy of its commit. */
const withDark = repoAfter([{ type: "switch", target: "dark-mode", create: true }, write("theme.css", "body { background: #111 }"), ...commitAll("Dark mode"), { type: "switch", target: "main" }], SHOP);
export const DARK = withDark.branches["dark-mode"]!;
const lostDark = repoAfter([{ type: "deleteBranch", name: "dark-mode", force: true }], withDark);

/* Undo a reset: two search commits were soft-reset away to squash them, then you changed your mind. */
const withSearch = repoAfter([write("search.js", "searchBox()"), ...commitAll("Search box"), write("search.js", "searchBox()\nshowResults()"), ...commitAll("Search results")], SHOP);
export const SEARCH = withSearch.branches.main!;
const softReset = repoAfter([{ type: "reset", target: "HEAD~2", mode: "soft" }], withSearch);

/* Undo an amend: a debug line went into "Add login" by accident. */
const withLogin = repoAfter([write("login.js", "login()"), ...commitAll("Add login")], SHOP);
export const LOGIN = withLogin.branches.main!;
const amended = repoAfter([write("login.js", "login()\ndebugger"), { type: "add", paths: ["login.js"] }, { type: "commit", amend: true }], withLogin);

export const scenarios: GitScenario[] = [
  {
    id: "lost-commit",
    title: l("Kaybolan commit", "The lost commit"),
    story: l(
      "Kaydetmediğin bir denemeyi atmak için `git reset --hard HEAD` yazacaktın; elin `HEAD~1` yazdı. Deneme gitti, ama dünkü \"Add payments\" commit'in de main'den düştü. `git log`'da artık yok.",
      "You meant to type `git reset --hard HEAD` to throw away an unsaved experiment; your fingers typed `HEAD~1`. The experiment is gone, but so is yesterday's \"Add payments\" commit from main. `git log` no longer shows it.",
    ),
    goal: l("main yeniden \"Add payments\" commit'ini göstersin.", "main points at the \"Add payments\" commit again."),
    start: lostPayments,
    hints: [
      l("Commit silinmedi, sadece onu gösteren isim geri gitti. HEAD'in her hareketi bir günlükte duruyor.", "The commit isn't deleted; only the name pointing at it moved back. Every move of HEAD is kept in a diary."),
      l("`git reflog` yaz ve \"commit: Add payments\" satırındaki kimliği bul. Sonra main'i `git reset --hard` ile oraya taşı.", "Type `git reflog` and find the id on the \"commit: Add payments\" line. Then move main there with `git reset --hard`."),
      l(`\`git reflog\` sonra \`git reset --hard ${short(PAYMENTS)}\``, `\`git reflog\` then \`git reset --hard ${short(PAYMENTS)}\``),
    ],
    par: 1,
    check: (ctx) => ctx.state.branches.main === PAYMENTS && status(ctx.state).clean,
  },
  {
    id: "deleted-branch",
    title: l("Silinen branch", "The deleted branch"),
    story: l(
      "Eski branch'leri temizlerken `git branch -D dark-mode` yazdın. Sonra hatırladın: \"Dark mode\" commit'i hiçbir yere merge edilmemişti, tek kopyası o branch'teydi.",
      "Cleaning up old branches you typed `git branch -D dark-mode`. Then you remembered: the \"Dark mode\" commit was never merged anywhere; that branch held its only copy.",
    ),
    goal: l("`dark-mode` adında bir branch yeniden \"Dark mode\" commit'ini göstersin.", "A branch named `dark-mode` points at the \"Dark mode\" commit again."),
    start: lostDark,
    hints: [
      l("Branch silmek commit'i silmez; HEAD o commit'teyken bunu reflog'a yazdı.", "Deleting a branch doesn't delete its commit; HEAD wrote it in the reflog while it was there."),
      l("`git reflog`'da \"commit: Dark mode\" satırının kimliğini bul. `git branch <ad> <kimlik>` o commit'e yeni bir branch açar.", "Find the id on the \"commit: Dark mode\" line in `git reflog`. `git branch <name> <id>` creates a branch at that commit."),
      l(`\`git branch dark-mode ${short(DARK)}\``, `\`git branch dark-mode ${short(DARK)}\``),
    ],
    par: 1,
    check: (ctx) => ctx.state.branches["dark-mode"] === DARK,
  },
  {
    id: "undo-reset",
    title: l("Reset'i geri al", "Undo a reset"),
    story: l(
      "İki arama commit'ini birleştirmek için `git reset --soft HEAD~2` yazdın. Commit atmadan önce fikrini değiştirdin: iki commit'in eskisi gibi kalmasını istiyorsun.",
      "To squash two search commits you typed `git reset --soft HEAD~2`. Before committing you changed your mind: you want the two commits back as they were.",
    ),
    goal: l("main tam olarak reset'ten önceki commit'e (\"Search results\") dönsün; bekleyen değişiklik kalmasın.", "main goes back to exactly where it was before the reset (\"Search results\"), with nothing pending."),
    start: softReset,
    hints: [
      l("Reset de HEAD'in bir hareketi; reflog'da ondan hemen önceki satır, reset'ten önce durduğun yer.", "A reset is a move of HEAD too; the reflog line just before it is where you stood before the reset."),
      l("`git reflog`'da en üstte reset satırı var. Altındaki satırın kimliğine `git reset --hard` ile dön.", "In `git reflog` the reset line is at the top. Go back to the id on the line below it with `git reset --hard`."),
      l(`\`git reset --hard ${short(SEARCH)}\``, `\`git reset --hard ${short(SEARCH)}\``),
    ],
    par: 1,
    check: (ctx) => ctx.state.branches.main === SEARCH && status(ctx.state).clean,
  },
  {
    id: "undo-amend",
    title: l("Amend'i geri al", "Undo an amend"),
    story: l(
      "\"Add login\" commit'ine `git commit --amend` ile küçük bir şey ekledin, ama yanlışlıkla `debugger` satırı da girdi. Henüz push etmedin. Amend'den önceki, temiz \"Add login\" commit'ini geri istiyorsun.",
      "You used `git commit --amend` to add something small to \"Add login\", and a `debugger` line slipped in by accident. You haven't pushed. You want the clean \"Add login\" from before the amend back.",
    ),
    goal: l("main amend'den **önceki** \"Add login\" commit'ini göstersin; klasör temiz olsun.", "main points at the \"Add login\" commit from **before** the amend; the folder is clean."),
    start: amended,
    hints: [
      l("Amend eski commit'i silmez, yerine yenisini koyar. İkisinin de mesajı \"Add login\": reflog hangisinin hangisi olduğunu söyler.", "Amend doesn't delete the old commit; it puts a new one in its place. Both say \"Add login\": the reflog tells you which is which."),
      l("`git reflog`'da \"commit (amend)\" satırı yeni olan. Altındaki \"commit: Add login\" eski olan; onun kimliğine dön.", "In `git reflog` the \"commit (amend)\" line is the new one. The \"commit: Add login\" line under it is the old one; go back to its id."),
      l(`\`git reset --hard ${short(LOGIN)}\``, `\`git reset --hard ${short(LOGIN)}\``),
    ],
    par: 1,
    check: (ctx) => ctx.state.branches.main === LOGIN && status(ctx.state).clean,
  },
];
