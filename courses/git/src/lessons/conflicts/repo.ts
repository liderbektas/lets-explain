import { ADA, createRepo, simulate, type GitAction, type Repo } from "../../engine/git";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

export const TITLE = "title.txt";
export const LOG = "CHANGELOG.md";

/**
 * A shop page with a title, and two branches that both changed it: main put a sale in the
 * title, feature renamed the shop. Both also started a CHANGELOG.md with their own line.
 */
const setup: GitAction[] = [
  write(TITLE, "Mağaza"),
  write("README.md", "Mağaza projesi"),
  add(TITLE, "README.md"),
  commit("Proje başladı"),
  { type: "switch", target: "feature", create: true },
  write(TITLE, "Online Mağaza"),
  write(LOG, "Karanlık tema eklendi"),
  add(TITLE, LOG),
  commit("Yeni isim ve karanlık tema"),
  { type: "switch", target: "main" },
  write(TITLE, "Mağaza: Büyük indirim"),
  write(LOG, "Şifre sıfırlama eklendi"),
  add(TITLE, LOG),
  commit("İndirim ve şifre sıfırlama"),
];

export const START: Repo = (() => {
  const r = simulate(setup, createRepo({ author: ADA }));
  return r.states[r.states.length - 1]!;
})();
