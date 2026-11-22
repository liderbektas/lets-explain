import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Parçalar
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste perdenin arkasına geçiyoruz: docker diye bir komut yazdığında aslında kim, neyi yapıyor?" },
        { say: "Sağdaki çizimde üç parça var. Solda terminal, yani senin yazdığın docker komutu. Buna CLI diyoruz." },
        { say: "Ortada asıl işi yapan Docker daemon var, programın adı dockerd. Image'ları saklar, container'ları başlatır ve durdurur. En sağda da image'ların yaşadığı registry; varsayılanı Docker Hub." },
        { say: "CLI sadece bir istemci. Her komutu daemon'a bir HTTP API isteği olarak gönderir, gelen cevabı ekrana yazar. Bunların hepsine birden Docker Engine deniyor." },
        { say: "Bir restoran düşün: siparişi garsona, yani CLI'a söylersin, yemeği mutfak, yani daemon yapar. Malzeme eksikse mutfak onu toptancıdan, yani registry'den getirtir." },
        { say: "Bu ikilinin gerçekten ayrı olduğunu görmek ister misin? Sonraki sayfaya geç." },
      ],
    },
    // 1 · docker version
    {
      lines: [
        { say: "CLI ile daemon'ın ayrı programlar olduğunu kendi gözünle görmenin kolay bir yolu var: docker version." },
        { say: "Bu komut iki bölüm yazar. Client, yani CLI'ın sürümü. Server, yani Engine: daemon ve onun altındaki containerd ile runc." },
        { say: "İkisi farklı programlar, hatta farklı makinelerde bile olabilirler. Bunu dersin sonunda tekrar hatırlayacağız." },
        { say: "Peki daemon çalışmıyorsa? O zaman CLI, Cannot connect to the Docker daemon diye başlayan bir hata verir. Yani CLI yerinde, ama konuşacak kimse yok." },
        { say: "Bu hatayı bir gün mutlaka göreceksin, ve artık ne demek olduğunu biliyorsun. Geç bakalım, ilk gerçek isteği gönderelim." },
      ],
    },
    // 2 · pull (tahmin: image'ı kim indirir?) · sahne: pull nginx:1.27
    {
      lines: [
        { say: "Şimdi terminale docker pull nginx 1.27 yazıyoruz." },
        { say: "Sence image'ı internetten kim indirir? docker CLI'ın kendisi mi, Docker daemon mı, yoksa Docker Hub image'ı kendiliğinden mi gönderir?" },
      ],
      answer: {
        right: "Evet, aynen!",
        wrong: "Yakındı ama değil. Oklara bak.",
        lines: [
          { say: "Komutu gönderiyoruz. CLI daemon'a şu image'ı indir dedi; daemon da Docker Hub'a gitti ve nginx 1.27'yi getirdi.", cue: 0 },
          { say: "Yani CLI sadece haber veriyor. Registry'ye bağlanan, katmanları indiren ve saklayan daemon." },
          { say: "Image da CLI'ın olduğu yerde değil, daemon'ın olduğu yerde saklanır. Linux'ta genelde var lib docker klasörünün altında, Docker Desktop'ta ise onun Linux sanal makinesinin içinde." },
          { say: "Artık image daemon'ın listesinde. Sonraki sayfada ondan bir container çalıştıralım." },
        ],
      },
    },
    // 3 · run · sahne: run web
    {
      lines: [
        { say: "Elimizde image var. Şimdi docker run ile, arka planda, web adında bir container başlatacağız." },
        { say: "Komutu gönderiyoruz. Bu sefer daemon registry'ye gitmedi, çünkü image zaten elindeydi. Container listesinde web belirdi.", cue: 0 },
        { say: "Container'ı başlatma işini daemon kendi altındaki containerd'ye verdi. O da runc ile süreci namespace ve cgroup'larla ayırarak başlattı." },
        { say: "Bir de şuna dikkat: arka planda çalıştır dediğimiz için CLI hemen döndü ve kapandı. Ama container çalışmaya devam ediyor." },
        { say: "Çünkü onu CLI değil, daemon tutuyor. Terminali kapatsan bile web çalışır. Sonraki sayfada makinede olmayan bir image deneyeceğiz." },
      ],
    },
    // 4 · Otomatik pull (tahmin: eksik image ile run) · sahne: run cache (redis:7)
    {
      lines: [
        { say: "Şimdi işi biraz zorlaştıralım. redis 7 image'ı bu makinede yok, onu hiç indirmedik." },
        { say: "Buna rağmen docker run ile cache adında bir container başlatırsak ne olur? Hata mı verir, daemon önce indirip sonra mı başlatır, yoksa container Docker Hub'da mı çalışır?" },
      ],
      answer: {
        right: "Doğru bildin!",
        wrong: "Mantıklı bir düşünce, ama değil. İzle.",
        lines: [
          { say: "Komutu gönderiyoruz. Bak, bu sefer iki ok birden yandı: daemon redis'i yerelde bulamadı, Docker Hub'dan çekti ve ardından cache container'ını başlattı.", cue: 0 },
          { say: "Gerçek terminalde bunu Unable to find image locally satırıyla görürsün, ardından indirme satırları gelir. Ayrı bir docker pull yazmana gerek kalmadı." },
          { say: "Bir de şunu unutma: container her zaman senin makinende çalışır. Docker Hub sadece image'ların durduğu yer." },
          { say: "Peki docker pull'u neden kullanırız? Image'ı önceden indirip ilk açılışı hızlandırmak ya da bir tag'in en güncel halini almak için." },
          { say: "Peki registry'de hiç olmayan bir image istersek? Onu da sonraki sayfada görelim." },
        ],
      },
    },
    // 5 · Olmayan image · sahne: run acme/ghost:1.0 (hata)
    {
      lines: [
        { say: "Şimdi bilerek yanlış bir şey yapalım. acme/ghost adında, hiçbir yerde olmayan bir image çalıştıracağız." },
        { say: "Komutu gönderiyoruz. Daemon registry'ye gitti ve eli boş döndü. Terminalde pull access denied hatası var.", cue: 0 },
        { say: "Hata diyor ki: böyle bir repository yok, ya da docker login gerekebilir. Ve dikkat et, hiçbir container oluşmadı." },
        { say: "Bu mesajın iki anlamı olabilir. Ya adı yanlış yazmışsındır, ya da image özel bir repository'dedir ve önce docker login ile giriş yapman gerekir." },
        { say: "Yani bu hatayı görünce önce yazımı, sonra erişimini kontrol et. Şimdi image isimlerinin içine biraz daha yakından bakalım." },
      ],
    },
    // 6 · Image adı (tahmin: kısa ad neye tamamlanır?) · sahne: pull gcr.io/distroless/nodejs22-debian12
    {
      lines: [
        { say: "Bu derste hep kısaca nginx yazdık. Ama daemon bu kısa isimden neyi çekeceğini nereden biliyor?" },
        { say: "Sence sadece nginx yazınca daemon tam olarak hangi image'ı çeker? Tam adı docker.io, library, nginx, latest olan image mı, en son çektiğin nginx sürümü mü, yoksa nginx 1.27 mi?" },
      ],
      answer: {
        right: "Süper, doğru!",
        wrong: "Olsun, bu kısım biraz gizli. Açayım.",
        lines: [
          { say: "Kısa isimler tamamlanır. Registry yazmazsan docker.io, namespace yoksa resmi image'lar için library, tag yoksa da latest eklenir." },
          { say: "Yani tam bir image adının dört parçası var: registry, namespace, repository ve tag." },
          { say: "Şimdi başka bir registry'den çekiyoruz: gcr.io, distroless, nodejs22-debian12. Burada registry gcr.io, yani Google'ınki, namespace de distroless.", cue: 0 },
          { say: "Daemon bu image'ı Docker Hub'dan değil, adın başında yazan registry'den çekti. Adın ilk parçası nereye gidileceğini söylüyor." },
          { say: "Kendi image'ların da genelde kullanıcı adı, uygulama ve sürümden oluşur; başına ghcr.io gibi bir registry de gelebilir. Sırada çok gerçek bir senaryo var, geç bakalım." },
        ],
      },
    },
    // 7 · Daemon restart (tahmin: container'lara ne olur?) · sahne: daemonRestart
    {
      lines: [
        { say: "Şu an web ve cache çalışıyor. İkisinin de restart policy'si yok, yani yeniden başlama kuralı tanımlamadık." },
        { say: "Şimdi daemon'ı yeniden başlatacağız. Sence container'lara ne olur? Hiçbir şey mi, ikisi de durup öyle mi kalır, yoksa ikisi de silinir mi?" },
      ],
      answer: {
        right: "Aynen öyle!",
        wrong: "Sürpriz olabilir, ama değil. Bak.",
        lines: [
          { say: "Daemon'ı yeniden başlatıyoruz. Daemon yeniden başladı yazısı belirdi, ve web ile cache Exited oldu.", cue: 0 },
          { say: "Çünkü container'ları daemon yönetir. Daemon durunca container'lar da durur. Geri geldiğinde ise sadece restart policy'si olanları yeniden başlatır." },
          { say: "Ama silinmediler, bu önemli. docker ps tire a ile hâlâ görünürler ve docker start ile geri gelirler." },
          { say: "Sunucu yeniden başlayınca servislerin kendiliğinden geri gelsin istiyorsan, container'ı restart unless-stopped ya da always ile başlatırsın. Ayrıntısı kaynaklar ve restart policy dersinde." },
          { say: "Son sayfada, CLI ile daemon'ın ayrı olmasının ilginç bir sonucunu konuşacağız. Geç bakalım." },
        ],
      },
    },
    // 8 · Gerçekte
    {
      lines: [
        { say: "Bu derste CLI ile daemon'ın ayrı programlar olduğunu gördük. Bunun güzel bir sonucu var: CLI başka bir makinedeki daemon'la da konuşabilir." },
        { say: "Bunu docker context ya da DOCKER_HOST ile yaparsın. Mesela kendi bilgisayarından, SSH üzerinden uzaktaki bir sunucunun daemon'ıyla konuşabilirsin." },
        { say: "Docker Desktop da aslında tam böyle çalışır: CLI senin Mac'inde, daemon ise Linux sanal makinesinin içinde." },
        { say: "Bir güvenlik notu: docker.sock soketine erişebilen herkes daemon'a her şeyi yaptırabilir, bu pratikte o makinede root olmak demek. O soketi bir container'a bağlamadan önce iki kez düşün." },
        { say: "Bir de dürüstlük notu: sahnede daemon, containerd ve runc tek kutu, registry'ye gidiş de anında. Gerçekte image katman katman iner ve ağına göre saniyeler, hatta dakikalar sürer." },
        { say: "Anlatacaklarım bu kadar. Şimdi sıra sende; sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Burası artık senin sahan. Aşağıda bir terminal var, ve gerçek bir sunucudan alınmış dört senaryo seni bekliyor." },
        { say: "Daemon'ın image'ı kendisi indirmesi, başka bir registry'den image, gece yeniden başlayan daemon ve kapanan container'ı geri getirmek." },
        { say: "Komutları kendin yazacaksın, sahne de CLI'ın daemon'a ne dediğini gösterecek. Takılırsan docker ps tire a kapanmış container'ları da gösterir, docker start da onları geri getirir." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız seni bekliyor. Hadi bakalım, kolay gelsin!" },
      ],
    },
  ],
};
