import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { DEPLOY, REDEPLOY, scene } from "./Scene";

const RENAME_SQL = `-- v5's migration: v4 breaks the moment this runs
ALTER TABLE customers RENAME COLUMN name TO full_name;`;

const EXPAND_SQL = `-- v5 (expand): add the new column, keep the old one
ALTER TABLE customers ADD COLUMN full_name text;

-- v6 (migrate): copy the data, start reading the new column
UPDATE customers SET full_name = name WHERE full_name IS NULL;

-- v7 (contract): only once no running version reads "name"
ALTER TABLE customers DROP COLUMN name;`;

export const rollback: Lesson = {
  slug: "rollback",
  title: l("Geri almak", "Rolling back"),
  summary: l(
    "Prod bozulduğunda en hızlı güvenli hamle, bir önceki sağlam image'ı yeniden deploy etmektir; düzeltme sonra, sakin kafayla gelir. Kodu geri almak kolaydır, veritabanını geri almak değil: migration'ları her iki sürümle de çalışacak şekilde yaz.",
    "When prod breaks, the fastest safe move is to redeploy the previous good image; the fix comes later, with a calm head. Rolling back code is easy, rolling back the database is not: write migrations that work with both versions.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Rollback'in bir önceki image'ı yeniden deploy etmek olduğunu görmek", "See that a rollback is redeploying the previous image"), step: 1 },
    { text: l("Önce geri alıp sonra düzeltmenin neden daha güvenli olduğunu bilmek", "Know why rolling back first and fixing after is safer"), step: 2 },
    { text: l("Bir migration'ın rollback'i nasıl bozduğunu anlamak", "Understand how a migration can break a rollback"), step: 3 },
    { text: l("Expand / contract ile geri alınabilir migration yazmak", "Write rollback-safe migrations with expand / contract"), step: 4 },
  ],
  steps: [
    {
      short: l("Prod bozuldu", "Prod broke"),
      tag: "problem",
      title: l("Testler geçti, prod 500 veriyor", "Tests passed, prod answers 500"),
      body: [
        l(
          "Her push'ta bir image build edilip doğrudan production'a gidiyor. Arama filtreleri (`8b1d24e`) sorunsuz çıktı. Hemen ardından yeni sepet (`c41e0a7`) geldi: testlerin yakalamadığı bir hatası var ve production artık 500 veriyor.",
          "Every push builds an image and sends it straight to production. Search filters (`8b1d24e`) went out fine. Right after, the new cart (`c41e0a7`) arrived: it has a bug the tests missed, and production now answers 500.",
        ),
        l(
          "Kullanıcılar şu an alışveriş yapamıyor. Her dakika önemli.",
          "Users cannot shop right now. Every minute counts.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: workflowFile(DEPLOY), code: workflowYaml(DEPLOY) }] },
    },
    {
      short: l("Geri al", "Roll back"),
      tag: "how",
      predict: {
        question: l("Production 500 veriyor. En hızlı **güvenli** hamle hangisi?", "Production answers 500. What is the fastest **safe** move?"),
        options: [
          l("Hatayı bulup düzeltmeyi hemen push'lamak", "Find the bug and push a fix right away"),
          l("Bir önceki image'ı (`sha-8b1d24e`) yeniden deploy etmek", "Redeploy the previous image (`sha-8b1d24e`)"),
          l("Sunucuları yeniden başlatmak", "Restart the servers"),
        ],
        answer: 1,
        why: l(
          "Önceki image birkaç dakika önce sorunsuz çalışıyordu ve registry'de hazır bekliyor. Aceleyle yazılan bir düzeltme ise yeni bir hata getirebilir. Yeniden başlatmak aynı bozuk kodu tekrar açar.",
          "The previous image ran fine minutes ago and sits ready in the registry. A fix written in a hurry may bring a new bug. A restart just starts the same broken code again.",
        ),
      },
      title: l("Rollback = öncekini yeniden deploy et", "Rollback = redeploy the previous one"),
      body: [
        l(
          "\"Redeploy\" workflow'unu `version: 8b1d24e` ile elle çalıştırdık. Hiçbir şey build edilmedi: registry'deki image production'a kondu ve site düzeldi. Bu bir [[rollback]].",
          "We ran the \"Redeploy\" workflow by hand with `version: 8b1d24e`. Nothing was built: the image from the registry went onto production and the site recovered. That is a [[rollback]].",
        ),
        l(
          "main'deki kod hâlâ bozuk ama artık kimse acı çekmiyor. Hatayı rahatça bulmak için zamanın var.",
          "The code on main is still broken, but nobody is hurting any more. You have time to find the bug calmly.",
        ),
      ],
      practice: {
        snippets: [{ label: workflowFile(REDEPLOY), code: workflowYaml(REDEPLOY) }],
        commands: [
          { cmd: "gh run list --workflow deploy.yml --status success --limit 5", note: l("Son başarılı deploy'lar: geri döneceğin SHA burada.", "The latest good deploys: the SHA to go back to is here.") },
          { cmd: "gh workflow run redeploy.yml -f version=8b1d24e" },
        ],
      },
    },
    {
      short: l("Sonra düzelt", "Fix after"),
      tag: "how",
      title: l("Düzeltme normal yoldan gelir", "The fix comes the normal way"),
      body: [
        l(
          "Hatayı bulduk ve düzeltmeyi (`5d9b3f2`) her zamanki gibi push'ladık: image'ı build edildi ve production'a gitti. Production şimdi main'in son halini çalıştırıyor.",
          "We found the bug and pushed the fix (`5d9b3f2`) as usual: its image was built and went to production. Production now runs main's newest commit.",
        ),
        l(
          "Bazı ekipler geri almak yerine hemen düzeltip ileri gitmeyi (\"fix forward\") seçer. Hata küçük ve nedeni belliyse bu da olur; ama emin değilsen önce geri al.",
          "Some teams fix and go forward right away (\"fix forward\") instead of rolling back. If the bug is small and its cause is clear, that works too; when in doubt, roll back first.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Rollback sadece önceki image hâlâ registry'deyse mümkün. Eski etiketleri silen bir temizlik kuralın varsa son birkaç sürümü her zaman sakla.",
            "A rollback only works if the previous image is still in the registry. If a cleanup rule deletes old tags, always keep the last few releases.",
          ),
        },
      ],
    },
    {
      short: l("Migration tuzağı", "Migration trap"),
      tag: "experiment",
      predict: {
        question: l(
          "v5'in migration'ı `name` sütununun adını `full_name` yaptı. v5'te başka bir hata çıktı ve v4'e geri döndük. v4 çalışır mı?",
          "v5's migration renamed the `name` column to `full_name`. v5 had another bug and we rolled back to v4. Does v4 work?",
        ),
        options: [
          l("Evet, rollback her şeyi geri alır", "Yes, a rollback undoes everything"),
          l("Hayır: v4 `name` sütununu arıyor ama o artık yok", "No: v4 looks for the `name` column, which is gone"),
          l("Sadece yeniden başlatılırsa", "Only after a restart"),
        ],
        answer: 1,
        why: l(
          "Rollback kodu geri alır, veritabanını değil. Migration çoktan çalıştı; şema ileri gitti ve eski kod onu tanımıyor.",
          "A rollback undoes the code, not the database. The migration has already run; the schema moved forward and the old code does not know it.",
        ),
      },
      title: l("Kod geri döndü, şema dönmedi", "The code went back, the schema did not"),
      body: [
        l(
          "v4 çalışmaya başladı ve ilk sorguda kırıldı: `column \"name\" does not exist`. Geri almak bu kez kurtarmadı, çünkü veritabanı tek ve iki sürüm de onu kullanıyor.",
          "v4 started and failed on its first query: `column \"name\" does not exist`. Rolling back did not save us this time, because there is one database and both versions use it.",
        ),
        l(
          "Bir de rolling deploy düşün: geçiş sırasında v4 ve v5 aynı anda çalışır. Adı değiştiren bir migration, daha rollback'e gelmeden v4 sunucularını bozar.",
          "Now think of a rolling deploy: during the switch v4 and v5 run at the same time. A renaming migration breaks the v4 servers before you even get to a rollback.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: "migrations/0005_rename.sql", code: RENAME_SQL }] },
    },
    {
      short: l("Expand / contract", "Expand / contract"),
      tag: "how",
      title: l("Değişikliği üç sürüme böl", "Split the change over three releases"),
      body: [
        l(
          "**Expand:** yeni sütunu ekle, eskisine dokunma; kod ikisine de yazsın. **Migrate:** eski veriyi yeni sütuna kopyala ve yeni sütundan okumaya başla. **Contract:** hiçbir çalışan sürüm eski sütunu okumadığında onu sil.",
          "**Expand:** add the new column, leave the old one alone; the code writes both. **Migrate:** copy the old data across and start reading the new column. **Contract:** once no running version reads the old column, drop it.",
        ),
        l(
          "Her adımda bir önceki sürüm hâlâ çalışabilir, yani her adım tek başına geri alınabilir. Daha yavaş görünür ama hiçbir deploy bir sonrakini beklemek zorunda kalmaz.",
          "At every step the previous version can still run, so each step can be rolled back on its own. It looks slower, but no deploy has to wait on another.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: "migrations/", code: EXPAND_SQL, note: l("Üç ayrı migration, üç ayrı deploy.", "Three migrations, three deploys.") }] },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede rollback", "Rollbacks in a real project"),
      body: [
        l(
          "**Rollback'i prova et:** ilk kez prod yanarken denenen bir rollback genelde çalışmaz. Redeploy workflow'unu staging'de arada bir kullan. **Ne zaman geri alırsın?** Yeni sürümden sonra hata oranı ya da gecikme belirgin şekilde arttıysa, tartışmadan önce geri al.",
          "**Rehearse it:** a rollback tried for the first time while prod is burning rarely works. Use the redeploy workflow on staging now and then. **When to roll back?** If the error rate or latency clearly went up after the new version, roll back first and discuss later.",
        ),
        l(
          "**Silinen veri geri gelmez:** bir migration bir sütunu ya da tabloyu sildiyse kodu geri almak veriyi geri getirmez. Böyle adımlardan önce yedek al ve onları ayrı, sakin bir deploy'a bırak.",
          "**Deleted data does not come back:** if a migration dropped a column or a table, rolling back the code does not bring the data back. Take a backup before such steps and keep them for a separate, quiet deploy.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede rollback anında bitiyor ve production tek bir yer. Gerçekte rollback de bir deploy'dur: Kubernetes'te `kubectl rollout undo`, bir bulut servisinde \"önceki revizyona dön\" gibi bir komut, ve birkaç dakika sürebilir. Migration tuzağı çizimde gösterildi; sahnedeki simülasyon veritabanını modellemiyor.",
            "On this stage a rollback finishes at once and production is one place. In reality a rollback is a deploy too: `kubectl rollout undo` in Kubernetes, a \"revert to previous revision\" in a cloud service, and it can take a few minutes. The migration trap is shown as a drawing; the simulation itself does not model the database.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "kubectl rollout undo deployment/shop", note: l("Kubernetes'te bir önceki sürüme dön.", "Go back to the previous version in Kubernetes.") }] },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Her push production'a gidiyor ve production ilk sürümü (`3f2a1c9`) çalıştırıyor. Değişiklik, bug'lı değişiklik ya da düzeltme push'layabilir, production'ı bir önceki image'a geri alabilirsin.",
          "Every push goes to production, which runs the first version (`3f2a1c9`). You can push a change, a buggy change or a fix, and roll production back to the previous image.",
        ),
        l("Sahnenin altında **2 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **2 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Rollback, bir önceki sağlam image'ı yeniden deploy etmektir; build gerekmez.", "A rollback is redeploying the previous good image; no build needed."),
    l("Prod yanarken önce geri al, düzeltmeyi sonra normal yoldan gönder.", "When prod is burning, roll back first and send the fix the normal way after."),
    l("Geri dönebilmek için eski SHA etiketleri registry'de kalmalı.", "To go back, the old SHA tags must stay in the registry."),
    l("Rollback kodu geri alır, veritabanını değil.", "A rollback undoes the code, not the database."),
    l("Migration'ları expand → migrate → contract olarak böl; her adım geri alınabilir olsun.", "Split migrations into expand → migrate → contract; every step stays reversible."),
  ],
  quiz: [
    {
      question: l("Rollback'te ne olur?", "What happens in a rollback?"),
      options: [
        l("Eski commit yeniden build edilir", "The old commit is built again"),
        l("Registry'deki önceki image yeniden deploy edilir", "The previous image from the registry is deployed again"),
        l("main branch'i eski commit'e döner", "The main branch is reset to the old commit"),
        l("Sunucular yeniden başlatılır", "The servers are restarted"),
      ],
      answer: 1,
      explain: l("Image zaten var; onu tekrar çalıştırmak yeter. main'e dokunulmaz.", "The image already exists; running it again is enough. main is not touched."),
      reviewStep: 1,
    },
    {
      question: l("Prod bozuk ve hatanın nedeni henüz belli değil. Ne yaparsın?", "Prod is broken and the cause is not clear yet. What do you do?"),
      options: [
        l("Önce geri alırım, sonra düzeltirim", "Roll back first, then fix"),
        l("Bulana kadar prod'u öyle bırakırım", "Leave prod as it is until I find it"),
        l("Testleri kapatıp hızlıca push'larım", "Turn off the tests and push quickly"),
        l("Bütün sunucuları kapatırım", "Shut down every server"),
      ],
      answer: 0,
      explain: l("Geri almak kullanıcıları hemen kurtarır ve sana zaman kazandırır.", "Rolling back saves users at once and buys you time."),
      reviewStep: 2,
    },
    {
      question: l("Bir migration sütun adını değiştirdi, sonra kodu geri aldın. Neden kırılabilir?", "A migration renamed a column, then you rolled the code back. Why might it break?"),
      options: [
        l("Eski image silinmiştir", "The old image was deleted"),
        l("Eski kod artık var olmayan sütunu arar", "The old code looks for a column that no longer exists"),
        l("Rollback her zaman kırılır", "Rollbacks always fail"),
        l("Cache temizlenmemiştir", "The cache was not cleared"),
      ],
      answer: 1,
      explain: l("Şema ileri gitti; rollback onu geri götürmez.", "The schema moved forward; a rollback does not take it back."),
      reviewStep: 3,
    },
    {
      question: l("Expand / contract'ın ilk adımı hangisi?", "What is the first step of expand / contract?"),
      options: [
        l("Eski sütunu silmek", "Drop the old column"),
        l("Yeni sütunu eklemek, eskisini bırakmak", "Add the new column and keep the old one"),
        l("Sütunun adını değiştirmek", "Rename the column"),
        l("Veritabanını yedekten geri yüklemek", "Restore the database from a backup"),
      ],
      answer: 1,
      explain: l("Önce genişlet: iki sürüm de çalışabilsin. Silmek en sona kalır.", "Expand first, so both versions can run. Dropping comes last."),
      reviewStep: 4,
    },
  ],
};
