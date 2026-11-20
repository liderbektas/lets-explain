import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, type GitAction } from "../../engine/git";
import { hashBlob } from "../../engine/objects";
import type { GitScenario } from "../shared/GitScene";
import { newCommits, repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const addAll: GitAction = { type: "add", paths: "." };
const commit = (message: string): GitAction => ({ type: "commit", message });

/** One commit: a README, the app's settings and a changelog. Free play starts here. */
export const BASE = repoAfter(
  [write("README.md", "Merhaba"), write("settings.txt", "port=8080"), write("CHANGELOG.md", "v1.0"), addAll, commit("Start")],
  createRepo({ author: ADA }),
);

export const scenarios: GitScenario[] = [
  {
    id: "keep-folders",
    title: l("Boş klasörler", "Empty folders"),
    story: l(
      "Uygulama `uploads/` ve `logs/` klasörlerinin var olmasını bekliyor, ama Git boş klasör saklamaz: tree'ler sadece dosyaları ve içinde dosya olan klasörleri tutar. Ekipler bu yüzden her klasöre boş bir `.gitkeep` dosyası koyar.",
      "The app expects `uploads/` and `logs/` folders to exist, but Git doesn't store empty folders: trees only hold files and folders that contain files. That's why teams put an empty `.gitkeep` file in each one.",
    ),
    goal: l(
      "`uploads/.gitkeep` ve `logs/.gitkeep` commit'lensin. Sahnede bak: iki boş dosya **tek bir blob'u** paylaşır.",
      "`uploads/.gitkeep` and `logs/.gitkeep` are committed. Look at the scene: two empty files share **one blob**.",
    ),
    start: BASE,
    hints: [
      l("Önce iki boş dosyayı oluştur. `touch` boş bir dosya yaratır, klasörüyle birlikte.", "Create the two empty files first. `touch` makes an empty file, folder and all."),
      l("`touch uploads/.gitkeep logs/.gitkeep`, sonra `git add` ve `git commit`.", "`touch uploads/.gitkeep logs/.gitkeep`, then `git add` and `git commit`."),
      l("`touch uploads/.gitkeep logs/.gitkeep`, `git add .`, `git commit -m \"Keep the uploads and logs folders\"`", "`touch uploads/.gitkeep logs/.gitkeep`, `git add .`, `git commit -m \"Keep the uploads and logs folders\"`"),
    ],
    par: 3,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const files = ctx.state.commits[c]!.files;
        return "uploads/.gitkeep" in files && "logs/.gitkeep" in files;
      }),
  },
  {
    id: "prod-settings",
    title: l("Aynı ayarlar", "Same settings"),
    story: l(
      "Canlı ortam için ayrı bir `settings.prod.txt` istendi; şimdilik içeriği `settings.txt` ile birebir aynı olacak. Bir ekip arkadaşın \"her kopya repo'yu büyütür\" diye endişeleniyor. Git'te aynı içerik bir kez saklanır.",
      "Production needs its own `settings.prod.txt`; for now its content is exactly the same as `settings.txt`. A teammate worries that every copy makes the repository bigger. In Git, the same content is stored once.",
    ),
    goal: l(
      "`settings.prod.txt`, `settings.txt` ile **aynı içerikle** commit'lensin: iki dosya, tek blob.",
      "`settings.prod.txt` is committed with **the same content** as `settings.txt`: two files, one blob.",
    ),
    start: BASE,
    hints: [
      l("`cat settings.txt` ile içeriğe bak. Blob kimliği sadece içerikten gelir: tek bir harf farkı yeni bir blob demek.", "Look at the content with `cat settings.txt`. A blob's id comes from the content alone: one character off means a new blob."),
      l("`echo \"...\" > settings.prod.txt` ile dosyayı aynı içerikle yaz, sonra ekle ve commit at.", "Write the file with the same content using `echo \"...\" > settings.prod.txt`, then add and commit."),
      l("`echo \"port=8080\" > settings.prod.txt`, `git add .`, `git commit -m \"Add production settings\"`", "`echo \"port=8080\" > settings.prod.txt`, `git add .`, `git commit -m \"Add production settings\"`"),
    ],
    par: 3,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const files = ctx.state.commits[c]!.files;
        return files["settings.prod.txt"] !== undefined && files["settings.txt"] !== undefined && hashBlob(files["settings.prod.txt"]!) === hashBlob(files["settings.txt"]!);
      }),
  },
  {
    id: "only-changelog",
    title: l("Sadece changelog", "Only the changelog"),
    story: l(
      "Sürüm notlarını `CHANGELOG.md`'ye yazdın. Bu arada `README.md`'de bir şeyler denedin ama o deneme gitmeyecek. Yeni commit'te README, bir önceki commit'tekiyle aynı kalmalı.",
      "You wrote the release notes in `CHANGELOG.md`. Meanwhile you tried something in `README.md`, but that experiment isn't going in. In the new commit, the README must stay as it was in the previous one.",
    ),
    goal: l(
      "Changelog commit'lensin; yeni commit'te `README.md` önceki commit'le **aynı blob'u** göstersin.",
      "The changelog is committed; in the new commit `README.md` points to **the same blob** as before.",
    ),
    start: repoAfter([write("CHANGELOG.md", "v1.0\nv1.1: search"), write("README.md", "Merhaba!!! (deneme)")], BASE),
    hints: [
      l("Değişmeyen bir dosya için Git yeni blob yazmaz; yeni tree eski blob'u gösterir. README'yi bu commit'e katma.", "For an unchanged file Git writes no new blob; the new tree points to the old one. Keep README out of this commit."),
      l("Sadece `CHANGELOG.md`'yi `git add` ile ekle, sonra commit at.", "`git add` only `CHANGELOG.md`, then commit."),
      l("`git add CHANGELOG.md` sonra `git commit -m \"Release notes for v1.1\"`", "`git add CHANGELOG.md` then `git commit -m \"Release notes for v1.1\"`"),
    ],
    par: 2,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const commit = ctx.state.commits[c]!;
        const parent = commit.parents[0] ? ctx.state.commits[commit.parents[0]] : undefined;
        return Boolean(parent) && commit.files["README.md"] === parent!.files["README.md"] && commit.files["CHANGELOG.md"] === "v1.0\nv1.1: search";
      }),
  },
  {
    id: "price-back",
    title: l("Fiyat geri", "Price back"),
    story: l(
      "Dün `prices.txt`'teki fiyatı `price=10`'dan `price=12`'ye çıkarıp commit'ledin. Bugün yönetici vazgeçti: fiyat yine 10 olacak. Dosyayı eskisiyle **birebir** aynı yapıp yeni bir commit atarsan, o commit'in tree'si iki commit önceki tree'nin ta kendisi olur.",
      "Yesterday you raised the price in `prices.txt` from `price=10` to `price=12` and committed. Today the manager changed their mind: it's 10 again. Make the file **exactly** what it was and commit, and that commit's tree is the very same tree as two commits ago.",
    ),
    goal: l(
      "Fiyatı geri alan yeni bir commit olsun ve **tree'si** geçmişteki bir commit'in tree'siyle aynı olsun.",
      "A new commit puts the price back, and its **tree** is the same as a tree already in the history.",
    ),
    start: repoAfter([write("prices.txt", "price=10"), addAll, commit("Add prices"), write("prices.txt", "price=12"), addAll, commit("Raise the price")], BASE),
    hints: [
      l("Aynı dosyalar, aynı içerik → aynı tree kimliği. Bir boşluk ya da büyük harf bile farkı bozar.", "Same files, same content → the same tree id. Even a space or a capital letter breaks it."),
      l("Dosyayı `echo` ile eski içeriğine yaz, sonra commit at. `git show HEAD~1:prices.txt` eski içeriği gösterir.", "Write the old content back with `echo`, then commit. `git show HEAD~1:prices.txt` shows the old content."),
      l("`echo \"price=10\" > prices.txt` sonra `git commit -am \"Price back to 10\"`", "`echo \"price=10\" > prices.txt` then `git commit -am \"Price back to 10\"`"),
    ],
    par: 2,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const tree = ctx.state.commits[c]!.tree;
        return Object.values(ctx.start.commits).some((o) => o.tree === tree);
      }),
  },
];
