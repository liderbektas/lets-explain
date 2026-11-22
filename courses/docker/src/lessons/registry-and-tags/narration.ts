import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Registry · sahne: pull nginx:1.27
    {
      lines: [
        { say: "Tekrar merhaba! Bu derste image'ları başkalarıyla nasıl paylaştığımızı göreceğiz: registry'ler ve tag'ler." },
        { say: "Sahneye bak: solda bu makine, sağda bir registry. Registry, image'ların saklanıp paylaşıldığı bir sunucu. En bilineni Docker Hub; nginx, postgres gibi resmi image'lar orada durur." },
        { say: "Hadi bir tane çekelim: docker pull ile nginx 1.27. Image registry'den bu makineye iniyor.", cue: 0 },
        { say: "Satırlardaki renkli kutulara dikkat et. O kutu image'ın kimliği, yani ID'si. İki tarafta aynı renk görüyorsan, aynı image demek." },
        { say: "Bu renk kuralı ders boyunca en iyi arkadaşın olacak. Solda bizim build ettiğimiz shop:dev de duruyor; sonraki sayfada ona yeni bir isim vereceğiz." },
      ],
    },
    // 1 · Tag (tahmin: docker tag ne yapar?) · sahne: tag shop:dev → ghcr.io/ada/shop:1.0.0
    {
      lines: [
        { say: "Elimizde shop:dev diye kendi image'ımız var. Şimdi docker tag ile ona ghcr.io/ada/shop:1.0.0 adını vereceğiz." },
        { say: "Sence bu komut ne yapar? Image'ın bir kopyasını mı oluşturur, aynı image'a ikinci bir isim mi verir, yoksa image'ı registry'ye mi gönderir?" },
      ],
      answer: {
        right: "Evet, tam isabet!",
        wrong: "Yakın ama değil. Kutulara bak.",
        lines: [
          { say: "Komutu çalıştırıyoruz. Solda yeni bir satır belirdi: ghcr.io/ada/shop:1.0.0. Ve kimlik kutusu, shop:dev'inkiyle aynı renk.", cue: 0 },
          { say: "Yani yeni bir image oluşmadı. Aynı image'ın artık iki adı var, diskte fazladan yer de kaplamıyor. Tag dediğimiz şey bir isim etiketi, o kadar." },
          { say: "Bu uzun adı bir adres gibi oku. ghcr.io registry, ada sahibi, shop repo, 1.0.0 da tag." },
          { say: "Registry yazmazsan Docker Hub varsayılır. Yani sadece nginx dediğinde aslında docker.io/library/nginx:latest demiş olursun." },
        { say: "Şimdi bu adı registry'ye gönderelim; sonraki sayfaya geç." },
        ],
      },
    },
    // 2 · push · sahne: push 1.0.0
    {
      lines: [
        { say: "docker push ile ghcr.io/ada/shop:1.0.0'ı gönderiyoruz. Sağa bak: registry'de aynı renkli kutuyla yeni bir satır çıktı.", cue: 0 },
        { say: "Artık başka bir bilgisayar ya da bir sunucu bu image'ı çekebilir. Ekipteki arkadaşın da, sunucu da aynı image'a ulaşıyor." },
        { say: "Peki push nereye gideceğini nereden biliyor? Adın başından. Adın başında ghcr.io yazdığı için GitHub'ın registry'sine gitti." },
        { say: "İşte bu yüzden önce image'ı o registry'nin adıyla tag'lememiz gerekiyordu. Gerçekte push'tan önce bir de docker login ile giriş yaparsın." },
        { say: "Bir sonraki sayfada aynı image'ı bir kez daha göndereceğiz. Bakalım ne olacak." },
      ],
    },
    // 3 · İkinci push (tahmin: kaç layer yüklenir?) · sahne: tag latest, push latest
    {
      lines: [
        { say: "Aynı image'a bir isim daha vereceğiz: latest. Sonra onu da push'layacağız." },
        { say: "Sence bu ikinci push kaç layer yükler? Hepsini baştan mı, hiçbirini mi, yoksa yarısını mı?" },
      ],
      answer: {
        right: "Aynen öyle!",
        wrong: "Mantıklı bir tahmin, ama hayır. İzle.",
        lines: [
          { say: "Önce latest adını veriyoruz. Solda yine aynı renkte bir satır daha.", cue: 0 },
          { say: "Ve push. Okun üstüne bak: sıfır layer yüklendi.", cue: 1 },
          { say: "Registry layer'ları içeriklerine göre tanır. Hepsi 1.0.0 ile zaten gitmişti; bu sefer sadece yeni bir isim eklendi." },
          { say: "Aynı şey çekerken de olur. Bir image'ın base layer'ları makinende zaten varsa, sadece eksik olanlar iner. Küçük ve paylaşılan base image'lar bu yüzden zaman kazandırır." },
          { say: "Registry'de artık 1.0.0 ve latest aynı image'ı gösteriyor. Ama bu latest adı birazdan başımızı ağrıtacak; sonraki sayfaya geçelim." },
        ],
      },
    },
    // 4 · latest kayar (tahmin: pull latest ne getirir?) · sahne: başkası latest'i push'lar, pull latest
    {
      lines: [
        { say: "Şimdi senaryo şu: bir takım arkadaşın yeni bir sürüm hazırladı ve onu latest adıyla push'ladı." },
        { say: "Sunucuda docker pull ile latest'i çekersek ne gelir sence? Dün çektiğimizle aynı image mı, en son push edilen farklı bir image mı, yoksa latest değiştirilemez diye bir hata mı?" },
      ],
      answer: {
        right: "Doğru bildin!",
        wrong: "Çoğu kişi öyle sanır. Bak ne oluyor.",
        lines: [
          { say: "Arkadaşın yeni sürümü gönderiyor. Registry'deki latest satırı kırmızı yandı: artık başka bir image'ı gösteriyor.", cue: 0 },
          { say: "Şimdi latest'i çekiyoruz. Yerel latest de değişti. Metriğe bak: latest ve 1.0.0 artık farklı.", cue: 1 },
          { say: "Çünkü tag'ler değişebilir. latest'in özel bir anlamı yok; sadece o adla en son gönderilen image'ı gösteren bir isim." },
          { say: "Düşünsene: latest ile çalışan bir sunucu yeniden başlıyor ya da yeni bir sunucu ekleniyor. Kimsenin test etmediği bir sürümü çalıştırabilir, ve hangi sürümün çalıştığını hiç tam bilemezsin." },
          { say: "Peki bundan nasıl korunuruz? Sonraki sayfada." },
        ],
      },
    },
    // 5 · Sabitle · sahne: pull 1.0.0
    {
      lines: [
        { say: "docker pull ile 1.0.0'ı çekiyoruz. Kutunun rengine bak: değişmedi. Hâlâ ilk image geliyor.", cue: 0 },
        { say: "O yüzden sunucularda, compose dosyalarında ve Dockerfile'ların FROM satırında hep belirli bir sürüm yaz." },
        { say: "Bir adım daha ileri gidebilirsin: digest. Her image'ın içeriğinden hesaplanan, sha256 ile başlayan bir parmak izi var." },
        { say: "Image'ı tag yerine bu digest'le çekersen, o içerik dışında hiçbir şey gelemez, biri aynı tag'i yeniden push'lasa bile." },
        { say: "Sürüm tag'leri de teknik olarak değişebilir; gerçek değişmezliği sadece digest verir. Bu arada sahnedeki kimlikler gerçek sha256 değil, kısa örnekler." },
        { say: "Şimdi bir de silme tarafına bakalım; sonraki sayfaya geç." },
      ],
    },
    // 6 · rmi (tahmin: bir adı silince ne olur?) · sahne: rmi 1.0.0
    {
      lines: [
        { say: "Yerelden ghcr.io/ada/shop:1.0.0'ı docker rmi ile sileceğiz. Unutma, aynı image'ın shop:dev adı da var." },
        { say: "Sence ne olur? Image silinir ve shop:dev de gider mi, sadece bu isim mi kalkar, yoksa Docker reddeder mi?" },
      ],
      answer: {
        right: "Süper, doğru!",
        wrong: "Olmadı, ama sorun yok. Bak.",
        lines: [
          { say: "rmi'yi çalıştırıyoruz. Altta untagged yazıyor. 1.0.0 satırı soldan kalktı.", cue: 0 },
          { say: "Ama shop:dev aynı renkli kutuyla yerinde duruyor. Registry'deki kopyaya da hiç dokunulmadı." },
          { say: "Birden fazla adı olan bir image'da rmi sadece o ismi kaldırır. Image ancak son adı da gidince silinir." },
          { say: "Sonraki sayfada gerçek hayattaki registry'lere bir göz atalım." },
        ],
      },
    },
    // 7 · Özel registry
    {
      lines: [
        { say: "Şirket kodu çoğu zaman herkese açık Docker Hub'a gitmez, özel bir registry'ye gider." },
        { say: "İyi haber şu: hepsi aynı mantıkla çalışır. Önce docker login ile giriş yaparsın, sonra adın başına registry'nin adresini yazarsın." },
        { say: "GitHub'ınki ghcr.io, GitLab'inki registry.gitlab.com. AWS'nin ECR'ında ise adres hesabın ve bölgeyle oluşur; giriş şifresini de AWS CLI üretir." },
        { say: "Bir dürüstlük notu: bu sahnede giriş yapmadan push ettik. Gerçekte özel registry'ler kimlik ister, Docker Hub da giriş yapmadan çekenlere bir sınır koyar." },
        { say: "CI'da da token'ı bir secret olarak verirsin. Geçelim, son olarak kendi projen için bir tag düzeni kuralım." },
      ],
    },
    // 8 · Tag stratejisi
    {
      lines: [
        { say: "İyi bir alışkanlık şu: her sürümü hiç değişmeyecek bir tag ile yayınla, mesela 1.4.2." },
        { say: "İstersen yanına kayan kısayollar da eklersin, 1.4 ya da sadece 1 gibi." },
        { say: "CI'da her build'e commit'in kısa kimliğini de tag olarak ver, sha tire diye başlayan bir tag. Böylece hangi kodun çalıştığını anında bilirsin." },
        { say: "latest'i kullanacaksan bile sadece en yeni anlamında kullan. Sunuculara ve compose dosyalarına hep bir sürüm ya da digest yaz." },
        { say: "Anlatacaklarım bu kadar. Şimdi sıra sende; sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Terminal artık senin. Bu makinede shop:dev image'ı hazır, registry GitHub Container Registry, token'ın da GITHUB_TOKEN değişkeninde." },
        { say: "Aşağıda gerçek işten beş senaryo seni bekliyor. Komutları kendin yaz; sahne her seferinde yerel tag'leri ve registry'yi gösterecek." },
        { say: "Takılırsan docker images yaz. Aynı IMAGE ID, aynı image demek; renkli kutuların terminaldeki hali bu." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi, iyi yayınlar!" },
      ],
    },
  ],
};
