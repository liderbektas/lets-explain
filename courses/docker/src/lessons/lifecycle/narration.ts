import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · created · sahne: create web
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste bir container'ın hayatını baştan sona izleyeceğiz: hazırlanıyor, çalışıyor, duruyor ve siliniyor." },
        { say: "Makinede nginx image'ı hazır, ama henüz hiç container yok. Alttaki şeride dikkat et; container'ın hangi halde olduğunu o gösterecek." },
        { say: "docker create ile web adında bir container oluşturuyoruz. Bak, sahnede beyaz duruyor, ışığı sönük. Şeritte de created yanıyor.", cue: 0 },
        { say: "Yani container hazır: ayarlarıyla birlikte oluşturuldu, ama içinde hiçbir şey çalışmıyor." },
        { say: "Bir container'ın dört hali var: created, running, exited ve silindi. Komutlar onu bu haller arasında taşır. Hadi sonraki sayfada onu çalıştıralım." },
      ],
    },
    // 1 · start · sahne: start web
    {
      lines: [
        { say: "Container hazır bekliyor. Şimdi ona hayat verelim." },
        { say: "docker start web diyoruz. Container'ın ana süreci başladı: nginx çalışıyor, ışık yeşil, şeritte running yanıyor.", cue: 0 },
        { say: "Bir şeyi fark et: önceki derslerde kullandığın docker run, aslında create ile start'ın tek komutta birleşmiş hali." },
        { say: "Yani run dediğinde Docker önce container'ı hazırlar, sonra hemen başlatır. Burada bu iki adımı ayrı ayrı yaptık." },
        { say: "Artık docker ps listesinde web var. Sonraki sayfada onu durduracağız, ama önce içine küçük bir not bırakacağız." },
      ],
    },
    // 2 · stop (tahmin: durdurunca ne olur?) · sahne: notu yaz, stop web
    {
      lines: [
        { say: "Planımız şu: container'ın içine notes.txt diye bir not yazacağız, sonra docker stop ile durduracağız." },
        { say: "Sence durdurunca container'a ne olur? Notla birlikte silinir mi, durur ama diskte mi kalır, yoksa bellekte mi duraklatılır?" },
      ],
      answer: {
        right: "Evet, çok iyi!",
        wrong: "Yakın ama değil. Hemen görelim.",
        lines: [
          { say: "Önce container'ın içine notumuzu yazıyoruz: alışveriş listesi.", cue: 0 },
          { say: "Şimdi docker stop web. Container griye döndü, şeritte exited yanıyor, çıkış kodu da 0.", cue: 1 },
          { say: "Sıfır şu demek: nginx kendisine gelen kapanma isteğine uydu ve temiz kapandı." },
          { say: "Ama container silinmedi. Ana süreci bitti, o kadar; kendi dosyalarıyla birlikte diskte bekliyor." },
          { say: "Sayaçlara bak: docker ps 0 diyor, docker ps tire a ise 1. Düz ps sadece çalışanları, tire a ise kapanmışları da gösterir." },
          { say: "Peki notumuz hâlâ orada mı? Sonraki sayfada bakalım." },
        ],
      },
    },
    // 3 · Yeniden start (tahmin: not durur mu?) · sahne: start web, notu oku
    {
      lines: [
        { say: "Durdurduğumuz web'i şimdi yeniden başlatacağız ve içindeki notes.txt dosyasını okuyacağız." },
        { say: "Ne çıkar sence? Not hâlâ orada mı, durdurmak her şeyi sıfırladı mı, yoksa container hiç başlamaz mı?" },
      ],
      answer: {
        right: "Bildin!",
        wrong: "Olsun, birlikte bakalım.",
        lines: [
          { say: "docker start web. Işık yeniden yeşil, şeritte running yanıyor.", cue: 0 },
          { say: "Şimdi notu okuyoruz… İşte orada: alışveriş listesi.", cue: 1 },
          { say: "Çünkü bu yeni bir container değil, aynı container yeniden başladı. Kendi yazılabilir katmanı, container silinene kadar durur." },
          { say: "Bilgisayarını kapatıp açmak gibi düşün: masaüstündeki dosyalar yerinde." },
          { say: "Ama bir uyarı: bu kalıcılık sadece container yaşadıkça geçerli. Önemli veriyi container'ın kendi katmanında tutma; volume'ları veri ve ağ bölümünde göreceğiz." },
          { say: "Peki container'ı silmeye kalkarsak? Sonraki sayfada deneyelim." },
        ],
      },
    },
    // 4 · rm (tahmin: çalışan container silinir mi?) · sahne: rm (reddedilir), stop, rm
    {
      lines: [
        { say: "web şu an çalışıyor. Onu durdurmadan, doğrudan docker rm ile sileceğiz." },
        { say: "Sence ne olur? Hemen silinir mi, Docker reddeder mi, yoksa önce durdurup sonra mı siler?" },
      ],
      answer: {
        right: "Tam isabet!",
        wrong: "Çok kişi böyle düşünür, ama bak.",
        lines: [
          { say: "docker rm web diyoruz… ve reddedildi. Hata açık: container is running, yani container çalışıyor.", cue: 0 },
          { say: "Docker, çalışan bir container'ı kazara silmeni engelliyor. Ya önce durdurursun, ya da bilerek rm tire f kullanırsın." },
          { say: "Biz temiz yolu seçelim. Önce docker stop ile durduruyoruz.", cue: 1 },
          { say: "Şimdi tekrar docker rm. Bu sefer silindi, şeritte silindi yanıyor.", cue: 2 },
          { say: "Silinen container geri gelmez. Kendi katmanı da, içindeki not da onunla birlikte gitti." },
          { say: "Peki aynı isimle yeni bir container açarsak not geri gelir mi? Sonraki sayfada." },
        ],
      },
    },
    // 5 · Yeni container (tahmin: aynı isim, not orada mı?) · sahne: run web, notu oku
    {
      lines: [
        { say: "Şimdi aynı adla, yine web adıyla, docker run ile yeni bir container başlatıp notes.txt dosyasını okuyacağız." },
        { say: "Not orada mı sence? İsim aynı olduğu için evet mi, bu tamamen yeni bir container olduğu için hayır mı, yoksa sadece bir volume bağlarsak mı?" },
      ],
      answer: {
        right: "Doğru!",
        wrong: "İsim aynı olsa da öyle değil. İzle.",
        lines: [
          { say: "web'i başlatıyoruz. Aynı isim, ama tamamen yeni bir container.", cue: 0 },
          { say: "Notu okuyoruz… No such file or directory. Böyle bir dosya yok.", cue: 1 },
          { say: "İsim sadece bir etiket. Yeni container image'ın temiz bir kopyasıyla doğar; eskisinin katmanı silindiğinde not da onunla gitti." },
          { say: "Bu bir kusur değil, bir özellik. Container'ı silip yeniden yaratmak, bilinen temiz hale dönmek demek." },
          { say: "Şimdiye kadar container'ları hep biz durdurduk. Sonraki sayfada kendi kendine kapanan bir container göreceğiz." },
        ],
      },
    },
    // 6 · Kendi biten · sahne: run hello (hello-world)
    {
      lines: [
        { say: "Bu sefer başka bir image kullanacağız: hello-world. Ekrana bir mesaj yazan minicik bir program." },
        { say: "Şerit de artık web'i değil, hello adındaki bu yeni container'ı izliyor." },
        { say: "docker run ile hello'yu başlatıyoruz. Bak, haller çok hızlı geçti: oluşturuldu, çalıştı, mesajını yazdı ve kendiliğinden exited oldu, çıkış kodu 0.", cue: 0 },
        { say: "Kimse stop demedi. Peki neden kapandı?" },
        { say: "Kural çok basit: container, ana süreci yaşadıkça yaşar. nginx gibi bir sunucu sonsuza kadar çalışır; bir script ise işini bitirince çıkar, container da onunla kapanır." },
        { say: "Şimdi de bir container'ı kibarca değil, zorla kapatmaya bakalım. Geç." },
      ],
    },
    // 7 · kill · sahne: kill web
    {
      lines: [
        { say: "Bir container'ı durdurmanın iki yolu var: stop ve kill. Aralarındaki fark küçük görünür ama önemlidir." },
        { say: "docker stop önce ana sürece SIGTERM gönderir, yani toparlan ve kapan der. Süreç 10 saniye içinde kapanmazsa SIGKILL ile zorla öldürür. nginx SIGTERM'e uyduğu için stop'ta kod 0'dı." },
        { say: "Şimdi docker kill web diyoruz. Doğrudan SIGKILL gitti: süreç hiçbir şeyi toparlayamadan öldü. Çıkış koduna bak: 137.", cue: 0 },
        { say: "137, 128 artı 9 demek; 9 da SIGKILL'in numarası. Açık dosyalar ve yarım işler, yarım kalır." },
        { say: "Bir ipucu: 137 gördüğünde iki şüpheli var. Ya biri docker kill dedi, ya da container bellek sınırını aştı. docker inspect içindeki OOMKilled alanı hangisi olduğunu söyler." },
        { say: "Geç, son olarak birkaç geçişe daha ve gerçek hayata bakalım." },
      ],
    },
    // 8 · Gerçekte
    {
      lines: [
        { say: "Gördüklerimizin dışında birkaç geçiş daha var. docker restart, stop ile start'ın birleşimi." },
        { say: "docker pause ise süreçleri yerinde dondurur, container paused haline geçer; docker unpause onları çözer. Bu sahnede pause'u modellemedik." },
        { say: "Bir de şunu bil: kapanmış container'lar sen silene kadar yer kaplar. Tek seferlik işler için rm seçeneğini kullan; birikenleri sonraki derste container prune ile temizleyeceğiz." },
        { say: "Bir dürüstlük notu: bu sahnede stop her zaman 0 ile biter ve hiç beklemez. Gerçekte uygulaman SIGTERM'i yakalamıyorsa docker stop 10 saniye bekler ve 137 görürsün." },
        { say: "Bunun nedenini CMD ve ENTRYPOINT dersinde açacağız. Şimdi sıra sende, sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Şimdi sahne senin. Aşağıda bir terminal var, ve gerçek işten alınmış dört senaryo seni bekliyor." },
        { say: "Bir container'ı önceden hazırlamak, bakım için durdurup geri açmak, kibarca kapatıp silmek ve kapanmışları temizlemek." },
        { say: "Komutları kendin yazacaksın. Alttaki şerit, web'in hangi halde olduğunu her an gösterecek." },
        { say: "Takılırsan docker ps tire a'ya bak: her container'ın durumunu gösterir, Created, Up ya da Exited." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi bakalım, kolay gelsin!" },
      ],
    },
  ],
};
