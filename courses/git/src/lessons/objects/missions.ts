import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { hashBlob } from "../../engine/objects";
import type { GitCtx } from "../shared/GitScene";
import { newCommits } from "../shared/missionHelpers";

export const missions: Mission<GitCtx>[] = [
  {
    id: "twins",
    title: l("İkiz dosyalar", "Twin files"),
    goal: l(
      "Bir commit at; içinde **iki farklı dosya aynı blob'u** paylaşsın.",
      "Make a commit in which **two different files share one blob**.",
    ),
    hint: l("Blob'un kimliği sadece içerikten gelir; dosyanın adı fark etmez.", "A blob's id comes from the content alone; the file name does not matter."),
    par: 3,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const ids = Object.values(ctx.state.commits[c]!.files).map(hashBlob);
        return new Set(ids).size < ids.length;
      }),
  },
  {
    id: "reuse",
    title: l("Değişmeyen paylaşılır", "Unchanged is shared"),
    goal: l(
      "Yeni bir commit at, ama `README.md`'nin blob'u bir önceki commit'tekiyle **aynı** kalsın.",
      "Make a new commit, but `README.md`'s blob must stay **the same** as in the previous commit.",
    ),
    hint: l("README'ye dokunmadan başka bir şeyi değiştir.", "Change something else and leave README alone."),
    par: 3,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const commit = ctx.state.commits[c]!;
        const parent = commit.parents[0] ? ctx.state.commits[commit.parents[0]] : undefined;
        return Boolean(parent) && commit.files["README.md"] === parent!.files["README.md"] && commit.tree !== parent!.tree;
      }),
  },
  {
    id: "same-tree",
    title: l("Aynı tree", "Same tree"),
    goal: l(
      "İki yeni commit at. Sonuncusunun **tree'si**, geçmişteki başka bir commit'in tree'siyle birebir aynı olsun.",
      "Make two new commits. The last one's **tree** must be exactly the same as another commit's tree in the history.",
    ),
    hint: l("Bir dosyayı değiştir, commit at; sonra eski haline geri getirip tekrar commit at.", "Change a file and commit; then put it back as it was and commit again."),
    par: 6,
    check: (ctx) => {
      const mine = newCommits(ctx);
      return mine.some((c) => Object.values(ctx.state.commits).some((o) => o.id !== c && o.tree === ctx.state.commits[c]!.tree));
    },
  },
];
