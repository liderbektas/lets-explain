import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const cmdVsEntrypoint: Lesson = {
  slug: "cmd-vs-entrypoint",
  title: l("CMD ve ENTRYPOINT", "CMD and ENTRYPOINT"),
  summary: l(
    "İkisi de container başlayınca ne çalışacağını söyler ama farklı şekilde. Hangisinin ezildiğini, hangisinin sabit kaldığını ve shell form'un neden `docker stop`'u beklettiğini gör.",
    "Both say what runs when a container starts, but differently. See which one gets replaced, which one stays, and why shell form makes `docker stop` wait.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("CMD'nin varsayılan komut olduğunu ve `docker run`'da ezildiğini görmek", "See that CMD is a default and is replaced on `docker run`"), step: 1 },
    { text: l("ENTRYPOINT'in sabit kaldığını, argümanların ona eklendiğini görmek", "See that ENTRYPOINT stays and arguments are appended to it"), step: 4 },
    { text: l("`--entrypoint` ile programın kendisini değiştirmek", "Replace the program itself with `--entrypoint`"), step: 5 },
    { text: l("Exec form ile shell form farkını ve sinyalleri anlamak", "Understand exec form versus shell form, and signals"), step: 6 },
  ],
  steps: [
    {
      short: l("CMD", "CMD"),
      tag: "how",
      title: l("CMD: varsayılan komut", "CMD: the default command"),
      body: [
        l(
          "`acme/greet:cmd` image'ının Dockerfile'ında tek bir satır var: `CMD [\"echo\", \"Merhaba\"]`. `docker run acme/greet:cmd` başka bir şey söylemediğin için bu komutu çalıştırdı ve ekrana `Merhaba` yazdı.",
          "The `acme/greet:cmd` image's Dockerfile has one line: `CMD [\"echo\", \"Merhaba\"]`. `docker run acme/greet:cmd` ran it because you said nothing else, and printed `Merhaba`.",
        ),
        l(
          "Sahnede üç parça var: image'ın Dockerfile'ı, senin yazdığın komut ve container'da gerçekten **PID 1** olarak çalışan süreç. Bu derste hep bu üçünü karşılaştıracağız.",
          "The stage has three pieces: the image's Dockerfile, the command you typed, and the process that really runs as **PID 1** in the container. This lesson keeps comparing those three.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run --rm acme/greet:cmd" }],
        snippets: [{ label: "Dockerfile", code: 'FROM alpine:3.20\nCMD ["echo", "Merhaba"]' }],
      },
    },
    {
      short: l("CMD ezilir", "CMD replaced"),
      tag: "experiment",
      predict: {
        question: l("CMD `echo Merhaba`. Şimdi `docker run acme/greet:cmd Ada` yazacağız. Ne olur?", "CMD is `echo Merhaba`. Now we type `docker run acme/greet:cmd Ada`. What happens?"),
        options: [
          l("`Merhaba Ada` yazar", "It prints `Merhaba Ada`"),
          l("`Ada` adlı bir program çalıştırmaya çalışır, bulamaz ve 127 ile çıkar", "It tries to run a program called `Ada`, cannot find it, and exits 127"),
          l("`Ada`'yı yok sayar ve `Merhaba` yazar", "It ignores `Ada` and prints `Merhaba`"),
        ],
        answer: 1,
        why: l(
          "Image adından sonra yazdığın her şey CMD'nin **tamamının** yerine geçer. Yeni komut `Ada` oldu ve böyle bir program yok.",
          "Everything after the image name replaces CMD **entirely**. The new command is `Ada`, and there is no such program.",
        ),
      },
      title: l("Argümanlar CMD'nin yerini alır", "Arguments replace CMD"),
      body: [
        l(
          "PID 1 artık `Ada`. Container `exec: \"Ada\": executable file not found in $PATH` yazdı ve [[exitCode|exit code]] **127** ile kapandı: \"komut bulunamadı\".",
          "PID 1 is now `Ada`. The container printed `exec: \"Ada\": executable file not found in $PATH` and stopped with [[exitCode]] **127**: \"command not found\".",
        ),
        l("CMD bir **varsayılan**: kimse bir şey söylemezse çalışır, bir şey söylenirse tamamen bırakılır.", "CMD is a **default**: it runs when nobody says otherwise, and is dropped completely when someone does."),
      ],
      practice: {
        commands: [
          { cmd: "docker run acme/greet:cmd Ada", note: l("exit 127: CMD tamamen ezildi.", "exit 127: CMD was replaced entirely.") },
          { cmd: "docker inspect --format '{{.State.ExitCode}}' <container>" },
        ],
      },
    },
    {
      short: l("Doğru ezme", "Replace it right"),
      tag: "how",
      title: l("CMD'yi bilerek değiştirmek", "Replacing CMD on purpose"),
      body: [
        l(
          "`docker run acme/greet:cmd echo Selam` tam bir komut verdi: PID 1 `echo Selam`, çıktı `Selam`. Bir image'ı farklı bir işle çalıştırmanın en sık yolu bu.",
          "`docker run acme/greet:cmd echo Selam` gave a whole command: PID 1 is `echo Selam`, the output is `Selam`. It is the most common way to run an image for a different job.",
        ),
        l(
          "Gerçek hayatta: `docker run node:22 node --version`, ya da bir web image'ından tek seferlik `python manage.py migrate` çalıştırmak.",
          "In real life: `docker run node:22 node --version`, or running a one-off `python manage.py migrate` from a web image.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run --rm acme/greet:cmd echo Selam" },
          { cmd: "docker run --rm node:22-slim node --version", note: l("Image'ın CMD'si yerine kendi komutun.", "Your own command instead of the image's CMD.") },
        ],
      },
    },
    {
      short: l("ENTRYPOINT", "ENTRYPOINT"),
      tag: "how",
      title: l("ENTRYPOINT: sabit program", "ENTRYPOINT: the fixed program"),
      body: [
        l(
          "`acme/greet:ep` iki satırla yazıldı: `ENTRYPOINT [\"echo\", \"Merhaba\"]` ve `CMD [\"dünya\"]`. Argümansız çalıştırınca Docker ikisini birleştirdi: PID 1 `echo Merhaba dünya`.",
          "`acme/greet:ep` has two lines: `ENTRYPOINT [\"echo\", \"Merhaba\"]` and `CMD [\"dünya\"]`. Run without arguments, Docker joined them: PID 1 is `echo Merhaba dünya`.",
        ),
        l(
          "Burada roller değişti: ENTRYPOINT **programın kendisi**, CMD ise ona verilen **varsayılan argümanlar**.",
          "Here the roles change: ENTRYPOINT is **the program itself**, CMD is the **default arguments** given to it.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run --rm acme/greet:ep" }],
        snippets: [{ label: "Dockerfile", code: 'FROM alpine:3.20\nENTRYPOINT ["echo", "Merhaba"]\nCMD ["dünya"]' }],
      },
    },
    {
      short: l("Argüman ekle", "Add arguments"),
      tag: "experiment",
      predict: {
        question: l("Aynı `Ada` argümanını bu sefer `acme/greet:ep`'e vereceğiz. Ne çıkar?", "We pass the same `Ada` argument, this time to `acme/greet:ep`. What comes out?"),
        options: [l("exit 127", "exit 127"), l("`Merhaba Ada`", "`Merhaba Ada`"), l("`Merhaba dünya Ada`", "`Merhaba dünya Ada`")],
        answer: 1,
        why: l(
          "Argüman yine CMD'nin yerini aldı, ama ENTRYPOINT yerinde kaldı ve argüman ona eklendi: `echo Merhaba` + `Ada`.",
          "The argument replaced CMD again, but ENTRYPOINT stayed and the argument was added to it: `echo Merhaba` + `Ada`.",
        ),
      },
      title: l("ENTRYPOINT kalır, CMD değişir", "ENTRYPOINT stays, CMD changes"),
      body: [
        l(
          "Çıktı `Merhaba Ada`. Bu, araç gibi davranan image'lar için ideal: kullanıcı programı değil, sadece ona ne vereceğini söyler.",
          "The output is `Merhaba Ada`. Ideal for images that act like a tool: users do not pick the program, only what to give it.",
        ),
        l(
          "Örneğin bir `acme/backup` image'ı `ENTRYPOINT [\"backup\"]` ve `CMD [\"--help\"]` ile gelir; `docker run acme/backup --db shop` sadece argümanları değiştirir.",
          "For example an `acme/backup` image ships `ENTRYPOINT [\"backup\"]` and `CMD [\"--help\"]`; `docker run acme/backup --db shop` only changes the arguments.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run --rm acme/greet:ep Ada" }],
      },
    },
    {
      short: l("--entrypoint", "--entrypoint"),
      tag: "how",
      title: l("--entrypoint: programı değiştir", "--entrypoint: replace the program"),
      body: [
        l(
          "`docker run --entrypoint ls acme/greet:ep /` programın kendisini değiştirdi: PID 1 `ls /` oldu ve kök dizini listeledi.",
          "`docker run --entrypoint ls acme/greet:ep /` replaced the program itself: PID 1 became `ls /` and listed the root directory.",
        ),
        l(
          "Dikkat: `--entrypoint` image'ın CMD'sini de **siler**. Argümanları (`/`) image adından sonra kendin yazmalısın. En sık kullanımı bir image'ın içine bakmak: `--entrypoint sh`.",
          "Careful: `--entrypoint` also **clears** the image's CMD. You write the arguments (`/`) after the image name yourself. Its most common use is looking inside an image: `--entrypoint sh`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run --rm --entrypoint ls acme/greet:ep /" },
          { cmd: "docker run --rm -it --entrypoint sh acme/greet:ep", note: l("Image'ın içinde bir kabuk aç, etrafa bak.", "Open a shell inside the image and look around.") },
        ],
      },
    },
    {
      short: l("Shell form", "Shell form"),
      tag: "experiment",
      predict: {
        question: l(
          "İki nginx var: biri CMD'si **shell form** ile, diğeri **exec form** (JSON dizisi) ile yazılmış. İkisine de `docker stop` diyoruz. Hangisi 10 saniye bekletip 137 ile kapanır?",
          "Two nginx images: one writes CMD in **shell form**, the other in **exec form** (a JSON array). We `docker stop` both. Which one makes you wait 10 seconds and ends with 137?",
        ),
        options: [l("Shell form", "Shell form"), l("Exec form", "Exec form"), l("İkisi de", "Both")],
        answer: 0,
        why: l(
          "Shell form'da PID 1 nginx değil `/bin/sh` olur ve SIGTERM'i nginx'e iletmez. Docker 10 saniye bekler, sonra SIGKILL gönderir: 137. Exec form'da sinyal doğrudan nginx'e gider ve temiz kapanır.",
          "In shell form, PID 1 is `/bin/sh`, not nginx, and it does not pass SIGTERM on. Docker waits 10 seconds, then sends SIGKILL: 137. In exec form the signal goes straight to nginx, which shuts down cleanly.",
        ),
      },
      title: l("Exec form ile shell form", "Exec form versus shell form"),
      body: [
        l(
          "Soldaki shell form: PID 1 `/bin/sh -c \"nginx -g 'daemon off;'\"`. Sağdaki exec form: PID 1 doğrudan `nginx`. İkisi de aynı siteyi sunar; fark kapanırken çıkar.",
          "Left, shell form: PID 1 is `/bin/sh -c \"nginx -g 'daemon off;'\"`. Right, exec form: PID 1 is `nginx` itself. Both serve the same site; the difference shows when they stop.",
        ),
        l(
          "Exec form temiz kapandı (0). Shell form 10 saniye sonra SIGKILL ile öldürüldü (137): yarım kalan istekler, yazılmamış dosyalar. Kural: **CMD ve ENTRYPOINT'i JSON dizisi olarak, çift tırnakla yaz.**",
          "Exec form stopped cleanly (0). Shell form was killed with SIGKILL after 10 seconds (137): requests cut off, files left unwritten. The rule: **write CMD and ENTRYPOINT as a JSON array, with double quotes.**",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede beklenen 10 saniye gösterilmiyor; shell form'un sonucunu doğrudan `kill` ile gösterdik. Ayrıca shell form ENTRYPOINT, CMD'yi ve `docker run` argümanlarını tamamen yok sayar.",
            "The 10-second wait is not shown here; we show shell form's outcome with a direct `kill`. Also, a shell-form ENTRYPOINT ignores CMD and `docker run` arguments altogether.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "time docker stop web", note: l("Shell form'da yaklaşık 10 saniye sürer.", "Takes about 10 seconds with shell form.") }],
        snippets: [
          { label: "Dockerfile · yapma", code: "CMD nginx -g 'daemon off;'" },
          { label: "Dockerfile · yap", code: 'CMD ["nginx", "-g", "daemon off;"]' },
        ],
      },
    },
    {
      short: l("127", "127"),
      tag: "problem",
      title: l("Exit code 127: komut yok", "Exit code 127: no such command"),
      body: [
        l(
          "`docker run acme/greet:cmd ehco merhaba`: tek harflik bir yazım hatası. `ehco` diye bir program yok, container hemen 127 ile kapandı.",
          "`docker run acme/greet:cmd ehco merhaba`: a one-letter typo. There is no program called `ehco`, so the container stopped at once with 127.",
        ),
        l(
          "127 gördüğünde üç şeye bak: komutun yazımı, image'da o programın olup olmadığı (küçük image'larda `bash`, `curl` yoktur) ve script'in dosya yolu.",
          "When you see 127, check three things: the spelling, whether the image has that program at all (small images lack `bash` and `curl`), and the script's file path.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker logs <container>", note: l("`executable file not found in $PATH` satırını arar.", "Look for the `executable file not found in $PATH` line.") },
          { cmd: "docker run --rm --entrypoint sh acme/greet:cmd -c 'which echo'", note: l("Program image'da var mı?", "Is the program in the image?") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projelerde nasıl yazılır?", "How real projects write it"),
      body: [
        l(
          "Çoğu uygulama için tek bir exec form `CMD` yeter: `CMD [\"node\", \"server.js\"]`. Kullanıcı gerekirse komutu tamamen değiştirebilir.",
          "For most apps one exec-form `CMD` is enough: `CMD [\"node\", \"server.js\"]`. Users can replace the whole command if they need to.",
        ),
        l(
          "Başlamadan önce hazırlık gerekiyorsa (bekleme, ayar dosyası üretme) bir giriş script'i yazılır ve sonunda `exec \"$@\"` ile CMD'ye devredilir; `exec` sayesinde asıl program PID 1 olur ve sinyalleri alır.",
          "When start-up needs preparation (waiting, generating a config file), an entrypoint script does it and ends with `exec \"$@\"` to hand over to CMD; thanks to `exec`, the real program becomes PID 1 and receives signals.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bir image'ın ne çalıştıracağını merak ediyorsan Dockerfile'ı aramana gerek yok: `docker inspect` image'ın Entrypoint ve Cmd alanlarını gösterir.",
            "To know what an image will run you do not need its Dockerfile: `docker inspect` shows the image's Entrypoint and Cmd fields.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "docker inspect --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}}' nginx:1.27" }],
        snippets: [
          { label: "docker-entrypoint.sh", code: '#!/bin/sh\nset -e\n# prepare: config files, migrations, waiting…\nexec "$@"' },
          { label: "Dockerfile", code: 'COPY docker-entrypoint.sh /usr/local/bin/\nENTRYPOINT ["docker-entrypoint.sh"]\nCMD ["node", "server.js"]' },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Makinede CMD'li `acme/greet:cmd` ve ENTRYPOINT'li `acme/greet:ep` var. Aşağıda gerçek işten **4 senaryo** var: `docker run` komutlarını, gerekirse Dockerfile'ı (`nano Dockerfile`) **kendin yaz**. Sahne her seferinde son container'ın Dockerfile'ını, yazdığın komutu ve gerçekten çalışanı gösterir.",
          "Your turn. The machine has `acme/greet:cmd` with a CMD and `acme/greet:ep` with an ENTRYPOINT. Below are **4 scenarios** from real work: **type the `docker run` commands yourself**, and the Dockerfile too when needed (`nano Dockerfile`). The stage shows the last container's Dockerfile, what you typed and what really ran.",
        ),
        l(
          "`docker inspect acme/greet:ep` bir image'ın `Entrypoint` ve `Cmd` ayarlarını gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`docker inspect acme/greet:ep` shows an image's `Entrypoint` and `Cmd`. Hints open one at a time; few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("CMD varsayılan komuttur; `docker run IMAGE ...` ile verilen argümanlar onun **tamamının** yerine geçer.", "CMD is the default command; arguments in `docker run IMAGE ...` replace **all** of it."),
    l("ENTRYPOINT sabit programdır; argümanlar (ya da yoksa CMD) ona eklenir.", "ENTRYPOINT is the fixed program; arguments, or CMD when there are none, are added to it."),
    l("`--entrypoint` programı değiştirir ve image'ın CMD'sini siler.", "`--entrypoint` replaces the program and clears the image's CMD."),
    l("Exec form (`[\"...\"]`) programı PID 1 yapar ve sinyalleri alır; shell form `/bin/sh` üzerinden çalışır ve `docker stop`'u 10 saniye bekletebilir.", "Exec form (`[\"...\"]`) makes the program PID 1 so it gets signals; shell form runs through `/bin/sh` and can make `docker stop` wait 10 seconds."),
    l("Exit code 127 \"komut bulunamadı\" demek: yazım, image'daki programlar ve dosya yolu kontrol edilir.", "Exit code 127 means \"command not found\": check the spelling, the programs in the image, and the file path."),
  ],
  quiz: [
    {
      question: l("Image'da `CMD [\"npm\", \"start\"]` var. `docker run app npm test` ne çalıştırır?", "The image has `CMD [\"npm\", \"start\"]`. What does `docker run app npm test` run?"),
      options: [l("`npm start npm test`", "`npm start npm test`"), l("`npm test`", "`npm test`"), l("`npm start`", "`npm start`"), l("Hata verir", "It fails")],
      answer: 1,
      explain: l("Argümanlar CMD'nin tamamının yerine geçer.", "Arguments replace CMD entirely."),
      reviewStep: 2,
    },
    {
      question: l("Image'da `ENTRYPOINT [\"curl\"]` ve `CMD [\"--help\"]` var. `docker run tool https://example.com` ne çalıştırır?", "The image has `ENTRYPOINT [\"curl\"]` and `CMD [\"--help\"]`. What does `docker run tool https://example.com` run?"),
      options: [l("`curl --help`", "`curl --help`"), l("`curl https://example.com`", "`curl https://example.com`"), l("`curl --help https://example.com`", "`curl --help https://example.com`"), l("`https://example.com`", "`https://example.com`")],
      answer: 1,
      explain: l("ENTRYPOINT kalır, argüman CMD'nin yerine geçip ona eklenir.", "ENTRYPOINT stays; the argument replaces CMD and is appended to it."),
      reviewStep: 4,
    },
    {
      question: l("`docker stop` her seferinde 10 saniye sürüyor ve container 137 ile kapanıyor. En olası sebep?", "`docker stop` always takes 10 seconds and the container ends with 137. Most likely cause?"),
      options: [
        l("Bellek yetmiyor", "Not enough memory"),
        l("CMD shell form'da yazılmış; PID 1 olan shell SIGTERM'i uygulamaya iletmiyor", "CMD is in shell form; the shell as PID 1 does not pass SIGTERM to the app"),
        l("Port çakışması", "A port clash"),
        l("Image çok büyük", "The image is too big"),
      ],
      answer: 1,
      explain: l("Exec form kullan ya da giriş script'inde `exec` ile asıl programı PID 1 yap.", "Use exec form, or `exec` the real program in your entrypoint script so it is PID 1."),
      reviewStep: 6,
    },
    {
      question: l("Container hemen 127 ile kapanıyor. İlk neye bakarsın?", "A container stops right away with 127. What do you check first?"),
      options: [l("Port ayarına", "The port setting"), l("Komutun yazımına ve image'da o programın olup olmadığına", "The command's spelling and whether the image has that program"), l("Volume'lara", "Volumes"), l("Network'e", "The network")],
      answer: 1,
      explain: l("127 \"executable file not found\": program adı yanlış ya da image'da yok.", "127 is \"executable file not found\": the program name is wrong or missing from the image."),
      reviewStep: 7,
    },
  ],
};
