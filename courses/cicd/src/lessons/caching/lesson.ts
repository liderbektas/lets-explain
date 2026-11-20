import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { scene, wf } from "./Scene";

const SETUP_NODE_CACHE = `      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci`;

const RESTORE_KEYS = `      - uses: actions/cache@v4
        with:
          path: ~/.npm
          key: npm-\${{ hashFiles('package-lock.json') }}
          restore-keys: |
            npm-`;

export const caching: Lesson = {
  slug: "caching",
  title: l("Cache", "Caching"),
  summary: l(
    "`actions/cache` bir klasörü bir anahtarla saklar ve sonraki run'larda geri getirir. Anahtarı `package-lock.json`'ın hash'inden üretirsen bağımlılıklar değişince anahtar da değişir; sabit bir anahtar ise bayat paketler getirir.",
    "`actions/cache` stores a folder under a key and brings it back in later runs. Build the key from the hash of `package-lock.json` and it changes when the dependencies do; a fixed key brings back stale packages.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Cache'in miss, kayıt ve hit döngüsünü görmek", "See the cache's miss, save and hit cycle"), step: 2 },
    { text: l("Anahtarı lockfile'ın hash'inden üretmek", "Build the key from the lockfile's hash"), step: 3 },
    { text: l("Sabit anahtarlı bir cache'in neden bayat paket getirdiğini anlamak", "Understand why a fixed-key cache brings back stale packages"), step: 5 },
    { text: l("Projende Node bağımlılıklarını doğru cache'lemek", "Cache Node dependencies correctly in your project"), step: 6 },
  ],
  steps: [
    {
      short: l("Her seferinde", "Every time"),
      tag: "problem",
      title: l("Her run aynı paketleri yeniden indiriyor", "Every run downloads the same packages again"),
      body: [
        l(
          "Runner her job'da boş başlar, yani `npm ci` her seferinde 412 paketi internetten indirip kuruyor: 45 saniye. Run #1 ve run #2'de bağımlılıklar hiç değişmedi ama ikisi de aynı 45 saniyeyi harcadı.",
          "The runner starts empty for every job, so `npm ci` downloads and installs 412 packages from the internet every time: 45 seconds. Run #1 and run #2 had the exact same dependencies, and both spent the same 45 seconds.",
        ),
      ],
    },
    {
      short: l("Cache ekle", "Add a cache"),
      tag: "how",
      title: l("actions/cache: bir klasör, bir anahtar", "actions/cache: a folder and a key"),
      body: [
        l(
          "`npm ci`'dan önce bir [[cache]] adımı ekledik. İki şey söylüyor: neyi saklayacağını (`path: ~/.npm`, npm'in indirdiği paketlerin durduğu klasör) ve hangi adla saklayacağını (`key`).",
          "We added a [[cache]] step before `npm ci`. It says two things: what to keep (`path: ~/.npm`, the folder where npm keeps downloaded packages) and under which name (`key`).",
        ),
        l(
          "Anahtar `npm-${{ hashFiles('package-lock.json') }}`: lockfile'ın içeriğinden üretilen bir hash. Run #3'te bu anahtarla kayıt yoktu (miss), `npm ci` yine 45 saniye sürdü. Ama job başarıyla bitince cache adımı klasörü bu anahtarla kaydetti.",
          "The key is `npm-${{ hashFiles('package-lock.json') }}`: a hash made from the lockfile's content. In run #3 there was nothing under that key (a miss) and `npm ci` still took 45 seconds. But once the job succeeded, the cache step saved the folder under that key.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(wf("npm")) }] },
    },
    {
      short: l("Hit", "Hit"),
      tag: "experiment",
      predict: {
        question: l("Sadece kodu değiştirip tekrar push'ladık; bağımlılıklar aynı. `npm ci` bu sefer ne kadar sürer?", "We changed only the code and pushed again; the dependencies are the same. How long does `npm ci` take this time?"),
        options: [l("Yine 45 saniye", "45 seconds again"), l("Çok daha kısa: paketler cache'ten gelir", "Much less: the packages come from the cache"), l("0 saniye: adım atlanır", "0 seconds: the step is skipped")],
        answer: 1,
        why: l(
          "Lockfile değişmediği için anahtar aynı ve kayıt bulundu (hit). `npm ci` yine çalışıyor ama paketleri internetten değil `~/.npm`'den alıyor.",
          "The lockfile did not change, so the key is the same and the entry was found (a hit). `npm ci` still runs, but takes the packages from `~/.npm` instead of the internet.",
        ),
      },
      title: l("Anahtar aynı: cache bulundu", "Same key: cache hit"),
      body: [
        l(
          "Run #4'te cache adımı \"Cache restored from key\" dedi ve `npm ci` **12 saniyede** bitti. Her run'da yarım dakikadan fazla kazanç; günde onlarca run'da ciddi bir süre.",
          "In run #4 the cache step said \"Cache restored from key\" and `npm ci` finished in **12 seconds**. Over half a minute saved per run, which adds up over dozens of runs a day.",
        ),
      ],
    },
    {
      short: l("Yeni bağımlılık", "New dependency"),
      tag: "experiment",
      predict: {
        question: l("Projeye `dayjs` paketini ekledik; `package-lock.json` değişti. Cache ne yapar?", "We added the `dayjs` package; `package-lock.json` changed. What does the cache do?"),
        options: [l("Eski kaydı getirir", "It brings back the old entry"), l("Yeni anahtar oluşur, kayıt bulunmaz", "A new key is made and nothing is found"), l("Run kırılır", "The run fails")],
        answer: 1,
        why: l(
          "Lockfile değişince hash'i de değişir, yani anahtar da. O anahtarla kayıt olmadığı için miss olur; `npm ci` her şeyi doğru kurar ve yeni anahtar kaydedilir.",
          "When the lockfile changes, so does its hash, and so does the key. Nothing exists under the new key, so it is a miss; `npm ci` installs everything correctly and the new key gets saved.",
        ),
      },
      title: l("Lockfile değişti: anahtar da değişti", "The lockfile changed: so did the key"),
      body: [
        l(
          "Run #5'te miss oldu, `npm ci` 45 saniye sürdü, testler yeşil ve cache'te artık iki anahtar var. Eski anahtar silinmez; eski lockfile'la çalışan başka bir branch onu kullanabilir.",
          "Run #5 missed, `npm ci` took 45 seconds, the tests are green, and the cache now holds two keys. The old key is not deleted; another branch still on the old lockfile can use it.",
        ),
        l(
          "İyi bir anahtarın kuralı bu: içerik değişince anahtar da değişmeli. Bir miss, yanlış dosya getirmekten her zaman daha ucuzdur.",
          "That is the rule for a good key: when the content changes, the key must change too. A miss is always cheaper than bringing back the wrong files.",
        ),
      ],
    },
    {
      short: l("Optimizasyon", "Optimization"),
      tag: "problem",
      title: l("Biri daha da hızlandırmak istedi", "Someone wanted it even faster"),
      body: [
        l(
          "Bir ekip arkadaşı şöyle düşündü: \"`~/.npm` yerine doğrudan `node_modules`'ı saklarsak, cache bulununca `npm ci`'ı hiç çalıştırmamıza gerek kalmaz.\" Anahtarı da sabit yazdı: `node_modules-deps`. Ve `npm ci`'a `if: steps.cache.outputs.cache-hit != 'true'` ekledi.",
          "A teammate thought: \"If we keep `node_modules` itself instead of `~/.npm`, we can skip `npm ci` entirely on a hit.\" They wrote a fixed key, `node_modules-deps`, and added `if: steps.cache.outputs.cache-hit != 'true'` to `npm ci`.",
        ),
        l("Run #6'da kayıt yoktu, `npm ci` çalıştı ve `node_modules` bu sabit anahtarla kaydedildi. Şimdilik her şey yeşil.", "In run #6 there was no entry, `npm ci` ran, and `node_modules` was saved under that fixed key. Everything is green for now."),
      ],
    },
    {
      short: l("Bayat", "Stale"),
      tag: "experiment",
      predict: {
        question: l("Yine bir bağımlılık ekleyip push'ladık. Sabit anahtarlı cache ne getirir?", "We added another dependency and pushed. What does the fixed-key cache bring back?"),
        options: [l("Yeni paketleri", "The new packages"), l("Eski `node_modules`'ı, ve `npm ci` atlanır", "The old `node_modules`, and `npm ci` is skipped"), l("Hiçbir şey", "Nothing")],
        answer: 1,
        why: l(
          "Anahtar hiç değişmediği için kayıt bulunur (hit). Ama içindeki `node_modules` eski lockfile'dan. `npm ci` da atlandığı için yeni paket hiç kurulmaz.",
          "The key never changes, so the entry is found (a hit). But the `node_modules` inside comes from the old lockfile. Since `npm ci` is skipped, the new package is never installed.",
        ),
      },
      title: l("Hit ama yanlış içerik", "A hit, with the wrong content"),
      body: [
        l(
          "Run #7 kırmızı: `Error: Cannot find module 'dayjs'`. Cache \"bulundu\" dedi, ama bulduğu şey bu commit'e ait değildi. Bu hata kafa karıştırır: yerelde her şey çalışır, CI'da çalışmaz.",
          "Run #7 is red: `Error: Cannot find module 'dayjs'`. The cache said \"hit\", but what it found did not belong to this commit. This error is confusing: everything works locally and fails in CI.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Belirti: lockfile'ı değiştiren PR'larda \"Cannot find module\" ya da garip sürüm hataları, ve cache'i silince düzelmesi. Sebep neredeyse her zaman içeriği yansıtmayan bir anahtar.",
            "The symptom: \"Cannot find module\" or odd version errors on PRs that change the lockfile, fixed by deleting the cache. The cause is almost always a key that does not reflect the content.",
          ),
        },
      ],
    },
    {
      short: l("Düzelt", "Fix"),
      tag: "how",
      title: l("Lockfile hash'li anahtara geri dön", "Go back to a key with the lockfile hash"),
      body: [
        l(
          "`~/.npm`'i lockfile hash'li anahtarla saklayan düzene geri döndük ve `npm ci`'ı her zaman çalıştırıyoruz. Run #8 yeni lockfile için miss oldu, her şeyi doğru kurdu ve yeşil.",
          "We went back to keeping `~/.npm` under a key with the lockfile's hash, and `npm ci` always runs. Run #8 missed for the new lockfile, installed everything correctly and is green.",
        ),
        l(
          "Daha da kısası: `actions/setup-node` bunu tek satırla yapar. `cache: npm` yazarsan aynı `~/.npm` cache'ini lockfile'a göre kendisi ayarlar.",
          "Even shorter: `actions/setup-node` does this in one line. Write `cache: npm` and it sets up the same `~/.npm` cache, keyed by the lockfile, for you.",
        ),
      ],
      practice: {
        snippets: [
          { label: ".github/workflows/ci.yml", code: SETUP_NODE_CACHE, note: l("Çoğu Node projesi için yeterli olan en kısa yol.", "The shortest way, enough for most Node projects.") },
          { label: ".github/workflows/ci.yml", code: RESTORE_KEYS, note: l("`restore-keys`: tam eşleşme yoksa `npm-` ile başlayan en yeni kaydı getirir. `~/.npm` için güvenlidir, çünkü `npm ci` eksikleri yine kurar.", "`restore-keys`: with no exact match, it restores the newest entry starting with `npm-`. Safe for `~/.npm`, because `npm ci` still installs whatever is missing.") },
        ],
        commands: [
          { cmd: "gh cache list", note: l("Repodaki cache kayıtları ve boyutları.", "The repo's cache entries and their sizes.") },
          { cmd: "gh cache delete --all", note: l("Bayat bir cache'ten şüpheleniyorsan hepsini sil.", "Delete them all if you suspect a stale cache.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede cache", "Caching in a real project"),
      body: [
        l(
          "**Sınırlar:** bir repo toplam 10 GB cache tutabilir; 7 gün kullanılmayan kayıtlar silinir. **Kapsam:** bir branch kendi kayıtlarını ve main'inkileri okuyabilir, ama başka bir feature branch'in kayıtlarını okuyamaz.",
          "**Limits:** a repo can hold 10 GB of cache in total; entries unused for 7 days are deleted. **Scope:** a branch can read its own entries and main's, but not another feature branch's.",
        ),
        l(
          "**Cache ve artifact farklıdır:** cache run'lar arasında hızlanmak için, kaybolsa da sorun olmaz. Bir run'ın ürettiği dosyaları taşımak artifact'in işi (sonraki ders).",
          "**Cache is not an artifact:** a cache is for speed between runs, and losing it does no harm. Moving files a run produced is what artifacts are for (next lesson).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede `npm ci` cache'le her zaman 12, cache'siz 45 saniye; anahtarlar kısa hash'ler. Gerçekte kazanç projeye ve ağa göre değişir. Cache'in kaydedilmesi job'ın sonunda ayrı bir \"Post\" adımında olur; sahnede bu, job başarılıysa sessizce yapılıyor.",
            "On stage `npm ci` always takes 12 seconds with a cache and 45 without, and keys are short hashes. In reality the gain depends on the project and the network. Saving happens in a separate \"Post\" step at the end of the job; on stage it happens silently when the job succeeds.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Aşağıda gerçek işten **4 senaryo** var: yavaş bir `npm ci`, yeni bir bağımlılık, bayat bir `node_modules` ve hiç tutmayan bir cache. Workflow'u `nano .github/workflows/ci.yml` ile düzenle, `git commit` ve `git push` ile gönder; aynı commit'i `gh run rerun <numara>` ile yeniden çalıştırabilirsin.",
          "Below are **4 scenarios** from real work: a slow `npm ci`, a new dependency, a stale `node_modules`, and a cache that never hits. Edit the workflow with `nano .github/workflows/ci.yml` and send it with `git commit` and `git push`; `gh run rerun <number>` runs the same commit again.",
        ),
        l(
          "Run'ın logunda cache adımı ne bulduğunu söyler (`Cache restored` ya da `Cache not found`), `npm ci` satırı da kaç saniye sürdüğünü. Soldaki kart hangi anahtarların saklandığını gösterir. Az komutla bitirirsen 3 yıldız alırsın.",
          "A run's log says what the cache step found (`Cache restored` or `Cache not found`), and the `npm ci` line how long it took. The card on the left shows which keys are stored. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`actions/cache` bir klasörü bir anahtarla saklar; ilk run miss olur ve job bitince kaydeder.", "`actions/cache` keeps a folder under a key; the first run misses and saves at the end of the job."),
    l("Aynı anahtarla sonraki run'lar hit olur ve `npm ci` çok kısalır.", "Later runs with the same key hit, and `npm ci` gets much shorter."),
    l("Anahtarı `hashFiles('package-lock.json')` ile üret: bağımlılıklar değişince anahtar da değişir.", "Build the key with `hashFiles('package-lock.json')`: when the dependencies change, so does the key."),
    l("Sabit anahtar ve atlanan `npm ci` bayat `node_modules` getirir: `Cannot find module`.", "A fixed key plus a skipped `npm ci` brings back stale `node_modules`: `Cannot find module`."),
    l("Node için en kısa yol: `actions/setup-node` ile `cache: npm`.", "The shortest way for Node: `cache: npm` on `actions/setup-node`."),
  ],
  quiz: [
    {
      question: l("Cache'in ilk run'da işe yaramaması normal mi?", "Is it normal that the cache does not help on the first run?"),
      options: [l("Hayır, bir hata var", "No, something is wrong"), l("Evet: kayıt yoktur, job bitince kaydedilir", "Yes: there is no entry yet; it is saved when the job ends"), l("Sadece Windows'ta", "Only on Windows"), l("Sadece PR'larda", "Only on PRs")],
      answer: 1,
      explain: l("İlk run miss olur ve klasörü kaydeder; kazanç sonraki run'larda gelir.", "The first run misses and saves the folder; the gain comes on later runs."),
      reviewStep: 1,
    },
    {
      question: l("Cache anahtarına neden `hashFiles('package-lock.json')` konur?", "Why put `hashFiles('package-lock.json')` in the cache key?"),
      options: [l("Anahtar daha kısa olsun diye", "To keep the key short"), l("Bağımlılıklar değişince anahtar da değişsin diye", "So the key changes when the dependencies do"), l("Cache hiç silinmesin diye", "So the cache is never deleted"), l("GitHub şart koştuğu için", "Because GitHub requires it")],
      answer: 1,
      explain: l("Anahtar içeriği yansıtmalı; lockfile değişince eski kayıt yanlış olur.", "The key must reflect the content; once the lockfile changes, the old entry is wrong."),
      reviewStep: 3,
    },
    {
      question: l("`node_modules`'ı sabit bir anahtarla cache'liyor ve hit olunca `npm ci`'ı atlıyorsun. Yeni bir paket ekleyince ne olur?", "You cache `node_modules` under a fixed key and skip `npm ci` on a hit. What happens when you add a package?"),
      options: [l("Yeni paket kurulur", "The new package gets installed"), l("Eski `node_modules` gelir ve yeni paket bulunamaz", "The old `node_modules` comes back and the new package is missing"), l("Cache otomatik silinir", "The cache is deleted automatically"), l("Run hızlanır", "The run gets faster")],
      answer: 1,
      explain: l("Anahtar değişmediği için hit olur; içerik eski lockfile'a ait.", "The key did not change, so it hits; the content belongs to the old lockfile."),
      reviewStep: 5,
    },
    {
      question: l("Bir run'ın build çıktısını aynı run'daki başka bir job'a taşımak için ne kullanırsın?", "What do you use to move a run's build output to another job in the same run?"),
      options: [l("Cache", "A cache"), l("Artifact", "An artifact"), l("Secret", "A secret"), l("Matrix", "A matrix")],
      answer: 1,
      explain: l("Cache hızlanmak içindir ve kaybolabilir; çıktıları taşımak artifact'in işi.", "A cache is for speed and may disappear; moving outputs is what artifacts do."),
      reviewStep: 7,
    },
  ],
};
