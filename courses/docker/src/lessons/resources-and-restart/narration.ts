import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Sınırsız · sahne: run api
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste iki şeyi konuşacağız: bir container ne kadar bellek ve CPU kullanabilir, ve çöktüğünde onu kim ayağa kaldırır." },
        { say: "api container'ını hiçbir sınır vermeden başlatıyoruz.", cue: 0 },
        { say: "Alttaki docker stats tablosuna bak. Bellek 120 MiB, yanında da sınırsız yazıyor." },
        { say: "Varsayılan budur: sınır yoksa bir container makinenin bütün belleğini ve CPU'sunu kullanabilir." },
        { say: "Tehlikesi şu: tek bir uygulamadaki bellek sızıntısı sadece kendini değil, aynı makinedeki her şeyi yavaşlatır, hatta çökertir. Sonraki sayfada bir sınır koyalım." },
      ],
    },
    // 1 · --memory · sahne: run api-lim --memory 256m
    {
      lines: [
        { say: "Bellek sınırı vermek için docker run'a memory seçeneğini ekliyoruz." },
        { say: "Aynı image'dan api-lim adında bir container başlatıyoruz, bu sefer 256 MB sınırla.", cue: 0 },
        { say: "Tabloda artık 120 MiB bölü 256 MiB yazıyor. Uygulamanın rahat çalışacağı kadar yer var." },
        { say: "Peki sınırı neye göre seçeceksin? Ortalamaya göre değil, uygulamanın en yoğun anına göre." },
        { say: "Bunun için önce sınırsız çalıştır, docker stats ile gerçek kullanımı ölç, sonra sınırı koy. Peki sınırı fazla dar tutarsak ne olur? Sonraki sayfada görelim." },
      ],
    },
    // 2 · Fazla dar (tahmin: 64 MB ile ne olur?) · sahne: run api-small --memory 64m
    {
      lines: [
        { say: "Şimdi bilerek hata yapacağız. Uygulamamız yaklaşık 120 MB kullanıyor; biz ona sadece 64 MB vereceğiz." },
        { say: "Sence ne olur? Yavaş ama çalışır mı, 137 ile öldürülür mü, yoksa Docker başlatmayı baştan reddeder mi?" },
      ],
      answer: {
        right: "Aynen öyle!",
        wrong: "Akla yatkın, ama değil. Bak.",
        lines: [
          { say: "api-small'ı 64 MB sınırla başlatıyoruz… ve hemen kapandı: Exited 137, OOM.", cue: 0 },
          { say: "Docker sınırı başlatırken kontrol etmez. Uygulama sınırı aştığı an, çekirdeğin OOM killer'ı onu SIGKILL ile öldürür." },
          { say: "Uygulamaya \"yavaşla\" denmedi, kibar bir durdurma sinyali de gelmedi. Doğrudan öldürüldü." },
          { say: "Emin olmak istersen inspect ile OOMKilled alanına bakarsın; true ise sebep bellek." },
          { say: "Peki ya uygulama başta sığıp sonra büyürse? Sonraki sayfada ona bakalım." },
        ],
      },
    },
    // 3 · Yük altında · sahne: api-lim'e 300 MB'lık yük
    {
      lines: [
        { say: "Bellek sınırı sadece açılışta aşılmaz, çalışırken de aşılabilir." },
        { say: "api-lim'i hatırla: 256 MB sınırla, 120 MB kullanarak rahat çalışıyordu." },
        { say: "Şimdi ona 300 MB isteyen büyük bir istek geliyor… ve container 137 ile öldürüldü.", cue: 0 },
        { say: "Gerçek hayatta bu, \"bazen sebepsiz kapanıyor\" diye görünür. Ama sebep belli: exit code 137 ve OOMKilled true." },
        { say: "Bunu görünce iki seçeneğin var: sınırı yükseltmek ya da uygulamanın en yoğun anında daha az bellek kullanmasını sağlamak. Şimdi geçelim, CPU tarafına bakalım." },
      ],
    },
    // 4 · --cpus (tahmin: fazla CPU isterse?) · sahne: run api-cpu --cpus 0.5
    {
      lines: [
        { say: "Bellekte sınırı aşan öldürülüyor. Peki CPU'da da durum aynı mı?" },
        { say: "api-cpu adında bir container'ı yarım çekirdeklik CPU sınırıyla çalıştıracağız; yani bir çekirdeğin en fazla yarısıyla." },
        { say: "Uygulama bundan fazlasını isterse ne olur sence? 137 ile öldürülür mü, yavaşlayıp çalışmaya devam mı eder, yoksa Docker onu durdurur mu?" },
      ],
      answer: {
        right: "Doğru bildin!",
        wrong: "Bellekle karıştırmak çok normal. İzle.",
        lines: [
          { say: "api-cpu'yu başlatıyoruz. Tablodaki CPUS sütununda 0.5 görüyorsun.", cue: 0 },
          { say: "CPU, bellek gibi bittiğinde ölünen bir kaynak değil. Çekirdek süreci sırayla bekletir; buna throttling diyoruz. Uygulama yavaşlar ama öldürülmez." },
          { say: "Kısaca aklında kalsın: bellek sınırı öldürür, CPU sınırı yavaşlatır." },
          { say: "Aynı makinede birden fazla servis varsa CPU sınırı çok işe yarar: birinin yoğun anı diğerlerini boğmaz." },
          { say: "Kaynaklar bu kadar. Sonraki sayfada çöken servislere geçiyoruz." },
        ],
      },
    },
    // 5 · Policy yok · sahne: run flaky, zaman geçer
    {
      lines: [
        { say: "Dersin ikinci yarısı: bir container çöktüğünde ne olur?" },
        { say: "flaky adında bir worker başlatıyoruz. Bir kuyruğa bağlanmaya çalışıyor, bağlanamıyor ve 1 ile kapanıyor.", cue: 0 },
        { say: "Biraz zaman geçiriyoruz… ve hiçbir şey olmuyor. flaky kapalı kalıyor.", cue: 1 },
        { say: "Çünkü restart policy verilmediyse, yani varsayılan olan no geçerliyse, Docker onu yeniden başlatmaz." },
        { say: "Bir düşün: gece yarısı kısa bir ağ kesintisi, sabaha kadar kapalı bir servis demek olabilir. Sonraki sayfada Docker'dan yardım isteyelim." },
      ],
    },
    // 6 · on-failure (tahmin: hangisi yeniden başlar?) · sahne: run flaky2, run backup, zaman geçer
    {
      lines: [
        { say: "İlk restart policy'miz on-failure. İki container'ı da bu ayarla başlatacağız." },
        { say: "flaky2 yine kuyruğa bağlanamayıp 1 ile kapanacak. backup ise işini yapıp 0 ile bitecek." },
        { say: "Biraz zaman geçince ne olur sence? İkisi de mi yeniden başlatılır, sadece flaky2 mi, yoksa hiçbiri mi?" },
      ],
      answer: {
        right: "Harika, tam olarak öyle!",
        wrong: "Güzel tahmin, ama değil. Bak.",
        lines: [
          { say: "flaky2'yi on-failure ile başlatıyoruz.", cue: 0 },
          { say: "backup'ı da aynı ayarla.", cue: 1 },
          { say: "Ve zamanı ilerletiyoruz. flaky2 her kapanışında yeniden başlatıldı, tabloda RESTARTS 3. backup ise 0 ile bitti ve öyle kaldı.", cue: 2 },
          { say: "on-failure sadece sıfırdan farklı bir exit code'da devreye girer. 0, \"işim bitti\" demek; yeniden başlatmaya gerek yok. Tek seferlik işler için tam istediğimiz bu." },
          { say: "Deneme sayısını da sınırlayabilirsin: on-failure'dan sonra iki nokta ve 5 yazarsan en fazla 5 deneme yapılır. Docker denemeler arasındaki bekleme süresini de 100 milisaniyeden başlayıp katlayarak artırır." },
          { say: "Böylece sürekli çöken bir servis makineyi meşgul etmez. Sonraki sayfada iki policy daha var." },
        ],
      },
    },
    // 7 · always / unless-stopped (tahmin: hangisi geri gelir?) · sahne: run web-a, run web-b, stop web-a, stop web-b, daemon restart
    {
      lines: [
        { say: "Uzun süre çalışan servisler için iki policy daha var: always ve unless-stopped. İkisi de container çökünce onu yeniden başlatır." },
        { say: "web-a always ile, web-b unless-stopped ile çalışacak. İkisini de elle durduracağız, sonra Docker daemon'ı yeniden başlatacağız." },
        { say: "Sence hangisi geri gelir? İkisi de mi, sadece web-a mı, yoksa hiçbiri mi?" },
      ],
      answer: {
        right: "Doğru, çok iyi!",
        wrong: "Bu ikisi gerçekten karışıyor. Bakalım.",
        lines: [
          { say: "web-a'yı always ile başlatıyoruz.", cue: 0 },
          { say: "web-b'yi unless-stopped ile.", cue: 1 },
          { say: "Şimdi web-a'yı elle durduruyoruz.", cue: 2 },
          { say: "web-b'yi de.", cue: 3 },
          { say: "Ve Docker daemon yeniden başlıyor… Bak: web-a geri geldi, web-b kapalı kaldı.", cue: 4 },
          { say: "always, elle durdurulsa bile daemon yeniden başlayınca geri gelir. unless-stopped ise \"ben durdurduysam durdurulmuş kalsın\" der." },
          { say: "O yüzden uzun süre çalışan servisler için unless-stopped çoğu zaman iyi bir varsayılan: çökünce ve makine açılınca gelir, bakım için durdurduğunda durur. Bir sayfa daha var." },
        ],
      },
    },
    // 8 · docker update
    {
      lines: [
        { say: "Buraya kadar her ayarı container'ı yaratırken verdik. Port gibi çoğu ayar için de böyle: değiştirmek istersen container'ı yeniden yaratırsın." },
        { say: "Ama kaynak sınırları ve restart policy istisna. Bunları docker update ile çalışan bir container'da da değiştirebilirsin." },
        { say: "Bellek sınırını büyütebilir, CPU payını değiştirebilir ya da sonradan bir restart policy ekleyebilirsin. Bu sahnede docker update modellenmedi; örnekler soldaki notlarda." },
        { say: "Compose kullanıyorsan aynı ayarları servis tanımına yazarsın. Böylece kimse uzun komut satırlarını hatırlamak zorunda kalmaz." },
        { say: "Bir dürüstlük notu: bu sahnede bellek sabit sayılarla, zaman da adım adım ilerliyor. Gerçekte kullanım sürekli değişir; swap açıksa container varsayılan olarak bir o kadar da swap kullanabilir." },
        { say: "Anlatacaklarım bu kadar. Sonraki sayfada sıra sende." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Burası senin sahan. Aşağıda bir terminal ve gerçek işten dört senaryo var." },
        { say: "Bellek yüzünden 137 ile kapanan bir API, çöktükçe kendini toparlaması gereken bir worker, sonsuza kadar tekrar başlayan bir yedek ve bakımda kalması gereken bir site." },
        { say: "Komutları kendin yazacaksın. docker ps -a exit code'ları, docker stats belleği gösterir. Bir de sleep 3 var: zamanı ilerletir, böylece restart'ları kendi gözünle görürsün." },
        { say: "Alttaki tablo bellek kullanımını ve sınırları gösterecek. İpuçları adım adım açılıyor; az komutla bitirirsen üç yıldız. Hadi, kolay gelsin!" },
      ],
    },
  ],
};
