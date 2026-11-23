import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const readingFailures: Lesson = {
  slug: "reading-failures",
  title: l("Kırık bir pipeline'ı okumak", "Reading a broken pipeline"),
  summary: l(
    "Kırmızı bir run'da önce kırılan ilk adımı bul, logunu aşağıdan yukarı oku, hatayı kendi makinende tekrar üret. Re-run ile geçen bir test flaky'dir; gerçek bir hata her denemede aynı yerde kırılır.",
    "In a red run, find the first failing step, read its log from the bottom up, and reproduce the error on your own machine. A test that passes on a re-run is flaky; a real bug fails in the same place on every attempt.",
  ),
  minutes: 15,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kırık bir run'da kırılan adımı ve hata satırını bulmak", "Find the failing step and the error line in a broken run"), step: 1 },
    { text: l("Hatayı kendi makinende tekrar üretmek", "Reproduce the error on your own machine"), step: 2 },
    { text: l("Flaky bir testi gerçek bir hatadan ayırmak", "Tell a flaky test from a real bug"), step: 5 },
    { text: l("Flaky testlerle ne yapılacağını bilmek", "Know what to do with flaky tests"), step: 6 },
  ],
  steps: [
    {
      short: l("Kırmızı X", "Red X"),
      tag: "problem",
      title: l("Commit'in yanında kırmızı bir X", "A red X next to your commit"),
      body: [
        l(
          "Sepete KDV ekleyip main'e push'ladın ve birkaç dakika sonra commit'inin yanında kırmızı bir X belirdi. Run #1 başarısız.",
          "You added VAT to the cart, pushed to main, and a few minutes later a red X showed up next to your commit. Run #1 failed.",
        ),
        l(
          "İlk refleks çoğu zaman \"CI yine bozuldu\" demek ya da hemen tekrar çalıştırmak. Ama kırmızı bir run sana tam olarak neyin bozulduğunu söyler; sadece nereye bakacağını bilmen gerek.",
          "The first reflex is often to say \"CI is broken again\" or to re-run it right away. But a red run tells you exactly what broke; you just need to know where to look.",
        ),
      ],
      practice: {
        commands: [{ cmd: "gh run list --limit 3", note: l("Son run'lar ve sonuçları.", "The latest runs and their results.") }],
      },
    },
    {
      short: l("Logu oku", "Read the log"),
      tag: "how",
      title: l("Kırılan ilk adımı bul, aşağıdan yukarı oku", "Find the first failing step, read it bottom up"),
      body: [
        l(
          "Altta job'ın logu var. Adımlar sırayla listeleniyor: checkout, Node, `npm ci` ve lint yeşil, `npm test` kırmızı, build atlandı. Bakman gereken yer **ilk kırmızı adım**; ondan sonrakiler zaten çalışmadı.",
          "Below is the job's log. The steps are listed in order: checkout, Node, `npm ci` and lint are green, `npm test` is red, the build was skipped. The place to look is the **first red step**; the ones after it never ran.",
        ),
        l(
          "Logu aşağıdan yukarı oku. En altta `Process completed with exit code 1` var: bu sadece \"komut başarısız oldu\" demek. Biraz yukarısında asıl mesaj: hangi test (`src/cart.test.ts > total adds VAT`) ve neden (`expected 118 to be 120`).",
          "Read the log from the bottom up. At the very bottom is `Process completed with exit code 1`: that only means \"the command failed\". A little above it is the real message: which test (`src/cart.test.ts > total adds VAT`) and why (`expected 118 to be 120`).",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Uzun loglarda arayüzdeki arama kutusunu kullan: `Error`, `FAIL`, `error TS` gibi kelimeler genelde seni doğrudan satıra götürür.",
            "In long logs, use the search box in the UI: words like `Error`, `FAIL` or `error TS` usually take you straight to the line.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "gh run view --log-failed", note: l("Sadece kırılan adımların logunu terminale getirir.", "Brings only the failed steps' log to your terminal.") },
          { cmd: "gh run view --log-failed | grep -n -E \"Error|FAIL\"" },
        ],
      },
    },
    {
      short: l("Yerelde tekrarla", "Reproduce"),
      tag: "how",
      title: l("Hatayı kendi makinende tekrar üret", "Reproduce the error on your own machine"),
      body: [
        l(
          "Logdan dosyayı ve test adını aldın. Şimdi aynı komutu, aynı temiz kurulumla kendi makinende çalıştır: `npm ci` ve sadece o test. Hata sende de çıkıyorsa artık CI'a bağımlı değilsin; düzeltip saniyeler içinde tekrar deneyebilirsin.",
          "The log gave you the file and the test's name. Now run the same command with the same clean install on your machine: `npm ci` and just that test. If the error shows up for you too, you no longer depend on CI; you can fix and retry in seconds.",
        ),
        l("Yuvarlamayı düzeltip push'ladık: Run #2 yeşil.", "We fixed the rounding and pushed: run #2 is green."),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Yerelde geçiyor ama CI'da kırılıyorsa farkı ara: Node sürümü, saat dilimi, eksik bir ortam değişkeni ya da sadece senin makinende olan bir dosya.",
            "If it passes locally but fails in CI, look for the difference: the Node version, the time zone, a missing environment variable, or a file that only exists on your machine.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "npm ci", note: l("CI ile aynı, temiz bir kurulum.", "The same clean install CI does.") },
          { cmd: "npx vitest run src/cart.test.ts", note: l("Sadece kırılan test dosyası.", "Only the failing test file.") },
          { cmd: "node --version", note: l("CI'daki Node sürümüyle aynı mı?", "Same Node version as CI?") },
        ],
      },
    },
    {
      short: l("Garip hata", "Odd error"),
      tag: "experiment",
      predict: {
        question: l(
          "Ödeme ekranına bir spinner ekledin. Run #3 kırıldı: `checkout.test.ts > confirms the order` testi `Test timed out in 5000ms` dedi. Sen bu teste dokunmadın. En olası açıklama?",
          "You added a spinner to the checkout screen. Run #3 failed: the `checkout.test.ts > confirms the order` test says `Test timed out in 5000ms`. You did not touch that test. The most likely explanation?",
        ),
        options: [
          l("Sipariş onaylama kodunu bozdun", "You broke the order confirmation code"),
          l("Test zamanlamaya bağlı ve bazen yetişemiyor", "The test depends on timing and sometimes does not make it"),
          l("GitHub'ın sunucuları bozuk", "GitHub's servers are broken"),
        ],
        answer: 1,
        why: l(
          "Zaman aşımı, sıraya ya da hıza bağlı bir testin tipik belirtisi. Bu kesin kanıt değil; ama bir hipotez. Bir sonraki adımda test edeceğiz.",
          "A timeout is the typical sign of a test that depends on order or speed. It is not proof yet, but it is a hypothesis. We test it in the next step.",
        ),
      },
      title: l("Mesaj tanıdık değil", "An unfamiliar message"),
      body: [
        l(
          "Bu sefer `AssertionError` yok: test bir sonuç beklerken 5 saniye doldu. Kodun yanlış bir değer üretmedi; test, bir şeyin zamanında olmasını bekledi.",
          "This time there is no `AssertionError`: the test ran out of 5 seconds while waiting for a result. Your code did not produce a wrong value; the test waited for something to happen in time.",
        ),
      ],
    },
    {
      short: l("Re-run", "Re-run"),
      tag: "experiment",
      predict: {
        question: l("Hiçbir şeyi değiştirmeden run'ı yeniden çalıştırıyoruz. Ne olur?", "We re-run the run without changing anything. What happens?"),
        options: [l("Aynı yerde yine kırılır", "It fails in the same place again"), l("Geçer", "It passes"), l("Run başlamaz", "The run does not start")],
        answer: 1,
        why: l(
          "Kod aynı, commit aynı, ama test bu sefer yetişti. Aynı kodla bazen geçen bazen kırılan teste [[flaky]] denir.",
          "Same code, same commit, but this time the test made it. A test that sometimes passes and sometimes fails with the same code is called [[flaky]].",
        ),
      },
      title: l("Aynı kod, farklı sonuç: flaky test", "Same code, different result: a flaky test"),
      body: [
        l(
          "Run #4 aynı commit'in ikinci denemesi (`deneme 2`) ve yeşil. Kodda hiçbir şey değişmedi, sadece test bu sefer zamanında bitti.",
          "Run #4 is the second attempt at the same commit (`attempt 2`) and it is green. Nothing changed in the code; the test simply finished in time.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "gh run rerun --failed", note: l("Son run'ın sadece kırılan job'larını yeniden çalıştırır.", "Re-runs only the failed jobs of the latest run.") },
        ],
      },
    },
    {
      short: l("Gerçek hata", "Real bug"),
      tag: "experiment",
      predict: {
        question: l(
          "Yeni commit'te ücretsiz kargo kuralında gerçek bir hata var ve run `AssertionError` ile kırıldı. Re-run'a basarsak?",
          "The new commit has a real bug in the free shipping rule, and the run failed with an `AssertionError`. If we press re-run?",
        ),
        options: [l("Geçer, flaky gibi", "It passes, like the flaky one"), l("Aynı hatayla yine kırılır", "It fails again with the same error"), l("Yarı yarıya", "Fifty-fifty")],
        answer: 1,
        why: l(
          "Gerçek bir hata koddadır, zamanlamada değil. Kod değişmedikçe her denemede aynı test aynı değerle kırılır.",
          "A real bug is in the code, not in the timing. Until the code changes, the same test fails with the same value on every attempt.",
        ),
      },
      title: l("Re-run gerçek bir hatayı düzeltmez", "A re-run does not fix a real bug"),
      body: [
        l(
          "Run #5 kırıldı, run #6 (aynı commit'in 2. denemesi) de aynı satırla kırıldı: `expected 118 to be 120`. Re-run'ın işe yaradığı tek durum, sorunun koddan değil zamanlamadan ya da dış bir servisten gelmesi.",
          "Run #5 failed, and run #6 (attempt 2 of the same commit) failed on the same line: `expected 118 to be 120`. A re-run only helps when the problem comes from timing or an outside service, not from the code.",
        ),
        l(
          "Bu yüzden önce logu oku: aynı hata, aynı test, aynı değer görüyorsan tekrar çalıştırmak sadece dakika harcar.",
          "That is why you read the log first: same error, same test, same value means another run only burns minutes.",
        ),
      ],
    },
    {
      short: l("Flaky ile yaşamak", "Living with flaky"),
      tag: "how",
      title: l("Flaky testi görmezden gelme, düzelt", "Do not ignore a flaky test, fix it"),
      body: [
        l(
          "Hem kargo kuralını hem de zamanlamaya bağlı testi düzelttik: test artık sabit 5 saniye beklemek yerine siparişin onaylanmasını bekliyor. Run #7 ilk denemede yeşil.",
          "We fixed both the shipping rule and the timing test: instead of a fixed 5-second wait, the test now waits for the order to be confirmed. Run #7 is green on the first attempt.",
        ),
        l(
          "Flaky testler zamanla ekibe \"kırmızı önemli değil, tekrar çalıştır\" alışkanlığını öğretir; sonra gerçek bir hata da tekrar çalıştırılıp gözden kaçar. Bir test flaky çıkarsa ya hemen düzelt ya da bir issue açıp geçici olarak ayır, ama sessizce yaşamaya devam etme.",
          "Over time flaky tests teach a team that \"red does not matter, just re-run\", and then a real bug gets re-run and missed too. When a test turns out flaky, fix it right away, or open an issue and set it aside for now, but do not quietly live with it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "for i in $(seq 20); do npx vitest run src/checkout.test.ts || break; done", note: l("Testi 20 kez arka arkaya çalıştır; ara sıra kırılıyorsa flaky.", "Run the test 20 times in a row; if it fails now and then, it is flaky.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede hata ayıklama", "Debugging in a real project"),
      body: [
        l(
          "**Daha fazla log:** repo secret'larına ya da variable'larına `ACTIONS_STEP_DEBUG=true` eklersen action'lar ayrıntılı log yazar. Re-run ekranındaki \"Enable debug logging\" kutusu da aynı işi tek seferlik yapar.",
          "**More logs:** add `ACTIONS_STEP_DEBUG=true` to the repo's secrets or variables and actions write detailed logs. The \"Enable debug logging\" box on the re-run screen does the same once.",
        ),
        l(
          "**Artifact olarak rapor:** test raporlarını ya da ekran görüntülerini artifact olarak yüklersen kırılan bir testi indirip bakabilirsin (\"Artifact'ler\" dersi).",
          "**Reports as artifacts:** upload test reports or screenshots as artifacts and you can download a failing test's output (the \"Artifacts\" lesson).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnedeki flaky test kurala bağlı: tek numaralı denemelerde kırılıyor, çift numaralılarda geçiyor. Gerçekte flaky bir test rastgele kırılır; bazen yüz denemede bir. Loglar da burada kısaltıldı.",
            "The flaky test on stage follows a rule: it fails on odd attempts and passes on even ones. In reality a flaky test fails at random, sometimes once in a hundred runs. The logs are shortened here too.",
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
          "Aşağıda gerçek işten **5 senaryo** var: her birinde `main`'de kırmızı bir run seni bekliyor. Logu `gh run view --log-failed` ile oku, kodu ya da testi `nano` ile düzelt, `git commit` ve `git push` ile gönder; gerektiğinde `gh run rerun` ile aynı commit'i yeniden çalıştır.",
          "Below are **5 scenarios** from real work: in each, a red run on `main` is waiting for you. Read the log with `gh run view --log-failed`, fix the code or the test with `nano`, send it with `git commit` and `git push`, and re-run the same commit with `gh run rerun` when that is the right call.",
        ),
        l(
          "Önce teşhis: aynı commit'te yeniden çalıştırınca geçen bir test flaky'dir, her seferinde aynı yerde kırılan bir test gerçek bir hatadır. Okuma komutları sayılmaz; az komutla bitirirsen 3 yıldız alırsın.",
          "Diagnose first: a test that passes when the same commit runs again is flaky; one that fails in the same place every time is a real bug. Reading commands don't count; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Kırmızı bir run'da önce ilk kırmızı adımı bul; sonrakiler hiç çalışmadı.", "In a red run, find the first red step; the ones after it never ran."),
    l("Logu aşağıdan yukarı oku: exit code satırının üstünde asıl hata mesajı var.", "Read the log bottom up: the real error sits above the exit code line."),
    l("Hatayı `npm ci` ve aynı komutla kendi makinende tekrar üret.", "Reproduce it on your machine with `npm ci` and the same command."),
    l("Aynı kodla bazen geçen bazen kırılan test flaky'dir; re-run ile geçebilir.", "A test that passes or fails with the same code is flaky; a re-run may pass."),
    l("Gerçek bir hata her denemede aynı yerde kırılır; re-run onu düzeltmez.", "A real bug fails in the same place every time; a re-run does not fix it."),
    l("Flaky testleri düzelt ya da ayır; \"tekrar çalıştır\" alışkanlığı gerçek hataları gizler.", "Fix or set aside flaky tests; a \"just re-run\" habit hides real bugs."),
  ],
  quiz: [
    {
      question: l("Bir job'da test kırmızı, build atlandı. Hatayı ararken nereden başlarsın?", "In a job, tests are red and the build was skipped. Where do you start looking?"),
      options: [l("Build adımının logundan", "The build step's log"), l("İlk kırmızı adımın, yani testin logundan", "The first red step's log: the tests"), l("Checkout adımından", "The checkout step"), l("Workflow dosyasından", "The workflow file")],
      answer: 1,
      explain: l("Atlanan adımın logu yoktur; hata ilk kırmızı adımdadır.", "A skipped step has no log; the error is in the first red step."),
      reviewStep: 1,
    },
    {
      question: l("Logun en altında `Process completed with exit code 1` yazıyor. Bu ne söyler?", "The log ends with `Process completed with exit code 1`. What does it tell you?"),
      options: [l("Hatanın sebebini", "The cause of the error"), l("Sadece komutun başarısız olduğunu; sebep biraz yukarıda", "Only that the command failed; the cause is a little above"), l("Testlerin hepsinin kırıldığını", "That every test failed"), l("Node'un kurulmadığını", "That Node was not installed")],
      answer: 1,
      explain: l("Exit code sadece başarısızlığı bildirir; asıl mesaj üstündeki satırlardadır.", "The exit code only reports failure; the actual message is in the lines above."),
      reviewStep: 1,
    },
    {
      question: l("Aynı commit'te re-run'a bastın ve run geçti. Bu ne anlama gelir?", "You pressed re-run on the same commit and the run passed. What does that mean?"),
      options: [l("Hata düzeldi", "The bug is fixed"), l("Bir flaky test var", "There is a flaky test"), l("CI bozuktu", "CI was broken"), l("Kod değişti", "The code changed")],
      answer: 1,
      explain: l("Kod aynıyken sonuç değiştiyse test flaky'dir; hata hâlâ bir gün tekrar çıkabilir.", "If the result changes while the code stays the same, the test is flaky; it can fail again any day."),
      reviewStep: 4,
    },
    {
      question: l("Run `AssertionError: expected 118 to be 120` ile kırıldı. Re-run da aynı satırla kırıldı. Sıradaki adım?", "The run failed with `AssertionError: expected 118 to be 120`. The re-run failed on the same line. Next step?"),
      options: [l("Bir kez daha re-run", "Re-run once more"), l("Testi silmek", "Delete the test"), l("Hatayı yerelde tekrar üretip kodu düzeltmek", "Reproduce it locally and fix the code"), l("Korumayı kaldırmak", "Remove branch protection")],
      answer: 2,
      explain: l("Aynı hata, aynı değer: sorun kodda. Kodu düzeltmeden sonuç değişmez.", "Same error, same value: the problem is in the code. The result will not change until the code does."),
      reviewStep: 5,
    },
  ],
};
