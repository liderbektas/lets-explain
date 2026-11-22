import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Varsayılan root (tahmin: whoami ne der?) · sahne: build root, run api-root, exec whoami
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste güvenliğin temellerine bakacağız: container'ı root olmadan çalıştırmak, sırları image'ın dışında tutmak ve doğru image'ı seçmek." },
        { say: "Elimizde basit bir Node API'si var. Dockerfile'ında USER diye bir satır yok; yani hangi kullanıcıyla çalışacağını hiç söylemedik." },
        { say: "Bu image'dan bir container başlatıp içinde whoami diye soracağız. Sence cevap ne olur: root mu, node mu, yoksa nobody mi?" },
      ],
      answer: {
        right: "Doğru, maalesef öyle!",
        wrong: "Keşke öyle olsaydı. Bak.",
        lines: [
          { say: "Önce image'ı build ediyoruz.", cue: 0 },
          { say: "Ondan api-root adında bir container başlatıyoruz.", cue: 1 },
          { say: "Ve docker exec ile whoami diye soruyoruz. Cevap: root. Sağdaki kartta kullanıcı kırmızı.", cue: 2 },
          { say: "Başka bir şey söylenmezse çoğu image'da ana süreç root olarak çalışır. Container yalıtılmış olsa da içerideki root, çekirdeği host ile paylaşır." },
          { say: "Uygulamanda bir açık olursa saldırgan işe root yetkisiyle başlar. Bir yapılandırma hatası ya da yeni bir çekirdek açığıyla host'a ulaşması kolaylaşır." },
          { say: "Peki bunu nasıl düzeltiriz? Sonraki sayfada." },
        ],
      },
    },
    // 1 · USER (tahmin: USER node ile whoami?) · sahne: build user, run api-user, exec whoami
    {
      lines: [
        { say: "Şimdi aynı uygulamayı iki değişiklikle yeniden kuracağız." },
        { say: "Dosyaları COPY'ye chown node:node vererek kopyalıyoruz, sonra da sona doğru USER node satırını ekliyoruz." },
        { say: "Bu sefer whoami ne der sence? Docker hep root çalıştırdığı için yine root mu, node mu, yoksa böyle bir kullanıcı yok diye hata mı?" },
      ],
      answer: {
        right: "Tam isabet!",
        wrong: "Yakın ama değil. Gösteriyorum.",
        lines: [
          { say: "Yeni image'ı build ediyoruz.", cue: 0 },
          { say: "api-user container'ını başlatıyoruz.", cue: 1 },
          { say: "Ve whoami… Cevap artık node.", cue: 2 },
          { say: "USER satırı, ondan sonraki satırları ve container'ın ana sürecini o kullanıcıyla çalıştırır. node kullanıcısı da resmi Node image'larında hazır gelir." },
          { say: "Bir püf noktası: USER satırını apt-get ya da npm ci gibi paket kurulumlarından sonra koy. Kurulumun root'a ihtiyacı olabilir, uygulamanın olmaz." },
          { say: "Image'da hazır kullanıcı yoksa kendininkini nasıl yaratacağın soldaki notlarda. Hadi geçelim, sırada sırlar var." },
        ],
      },
    },
    // 2 · Gömülü sır · sahne: build leaky
    {
      lines: [
        { say: "Şimdi çok sık yapılan bir hataya bakalım. Proje klasöründe bir .env dosyası var ve içinde bir API anahtarı duruyor." },
        { say: "Bu Dockerfile .env dosyasını image'a kopyalıyor. Build ediyoruz… ve docker history kartında o katman kırmızı yandı.", cue: 0 },
        { say: "Artık API_KEY image'ın bir parçası. Image'ı registry'ye gönderen, oradan çeken ya da bir yerde saklayan herkes o anahtarı okuyabilir." },
        { say: "Bunun için usta bir saldırgan olmaya da gerek yok. docker save ile image'ı dışarı aktarmak ya da container'da cat ile dosyayı okumak yeter." },
        { say: "Peki dosyayı bir sonraki satırda silsek kurtulur muyuz? Sonraki sayfada deneyelim." },
      ],
    },
    // 3 · rm işe yarar mı? (tahmin: sır kalır mı?) · sahne: build leaky2
    {
      lines: [
        { say: "Akla gelen ilk çözüm şu: .env'i kopyaladığımız satırın hemen arkasına RUN rm .env ekleyelim. Dosya silinsin, iş bitsin." },
        { say: "Sence son image'da sır hâlâ var mı? Silindiği için yok mu, önceki katmanda duruyor mu, yoksa image hiç build olmaz mı?" },
      ],
      answer: {
        right: "Evet, ne yazık ki duruyor!",
        wrong: "Keşke öyle olsa. Bak ne oluyor.",
        lines: [
          { say: "Yeni Dockerfile'ı build ediyoruz. Bak, .env'i kopyalayan katman hâlâ kırmızı.", cue: 0 },
          { say: "Üstteki rm katmanı 0 MB. İçinde dosya yok, sadece \"bu dosya artık görünmesin\" diye bir not var." },
          { say: "Her satır yeni bir katman ekler ve eski katmanlar hiç değişmez. rm dosyayı üstte gizler, ama alttaki katman sırrı taşımaya devam eder." },
          { say: "O yüzden kural net: bir sır bir kez image'a girdiyse onu sızmış say, anahtarı iptal edip yenisini üret." },
          { say: "Sadece yeniden build etmek yetmez, çünkü eski image başka yerlerde durabilir. Doğru yolu sonraki sayfada görelim." },
        ],
      },
    },
    // 4 · Temiz image · sahne: build clean, run api -e API_KEY
    {
      lines: [
        { say: "Doğru yol şu: sır image'a hiç girmesin, container'a çalışırken gelsin." },
        { say: ".env dosyası artık .dockerignore'da duruyor, yani build'e hiç girmiyor. Image'ı build ediyoruz; bak, hiçbir katman kırmızı değil.", cue: 0 },
        { say: "Şimdi container'ı başlatıyoruz ve anahtarı ortam değişkeni olarak, dışarıdan veriyoruz. Kartta API_KEY görünüyor, ama değeri gizli.", cue: 1 },
        { say: "Bunun güzel tarafı: aynı image her ortamda kullanılır. Değişen sadece dışarıdan verilen ayarlar." },
        { say: "Gerçek ortamlarda bu değerleri genelde bir secret manager verir: Docker ya da Kubernetes secrets, Vault veya bulutun kendi aracı." },
        { say: "Peki build'in kendisi bir sırra ihtiyaç duyarsa? Sonraki sayfaya geçelim." },
      ],
    },
    // 5 · Build secret
    {
      lines: [
        { say: "Bazen build'in kendisi bir anahtar ister. Mesela özel bir npm paketi ya da özel bir git deposu indirmen gerekir." },
        { say: "Bu anahtarı ARG ya da ENV ile vermek cazip gelir, ama ikisi de image geçmişinde görünür. Yani yine sızdırmış olursun." },
        { say: "Bunun için BuildKit'in secret mount'u var. Dosyayı sadece o tek RUN satırı süresince bağlar ve hiçbir katmana yazmaz." },
        { say: "Bu sahnede modellenmedi; nasıl yazıldığını soldaki notlarda görebilirsin." },
        { say: "Sırlar bu kadar. Sonraki sayfada image'ı nereden çektiğine bakalım." },
      ],
    },
    // 6 · Resmi image · sahne: pull nod:22-slim (hata)
    {
      lines: [
        { say: "Güvenlik sadece kendi Dockerfile'ınla ilgili değil. Kullandığın base image'ı nereden çektiğin de önemli." },
        { say: "node yerine nod yazarak bir image çekmeye çalışıyoruz. Hata: böyle bir image yok.", cue: 0 },
        { say: "Bu sahnede yok, ama gerçek Docker Hub'da tanıdık adlara benzeyen ve içinde zararlı kod taşıyan image'lar bulunabiliyor." },
        { say: "O yüzden Docker Hub'da Docker Official Image ya da Verified Publisher rozeti olan image'ları tercih et." },
        { say: "Sürümü de sabitle: node 22-slim gibi, hatta digest ile. Ve image'ı düzenli olarak güncelle. Sonraki sayfada çok daha küçük bir image deneyeceğiz." },
      ],
    },
    // 7 · Distroless (tahmin: sh açılır mı?) · sahne: build distroless, run api-dl, exec sh
    {
      lines: [
        { say: "Şimdi uygulamayı distroless denen, çok küçük bir image'a taşıyacağız. İki aşamalı bir build: bağımlılıklar node 22-slim içinde kurulacak, çalışan image ise distroless olacak." },
        { say: "Sonra docker exec ile içinde sh, yani bir kabuk açmaya çalışacağız. Ne olur sence? Kabuk açılır mı, açılmaz mı, yoksa Docker bize root kabuğu mu verir?" },
      ],
      answer: {
        right: "Süper, doğru!",
        wrong: "Olsun, bu biraz şaşırtıcı. İzle.",
        lines: [
          { say: "İki aşamalı build'i yapıyoruz.", cue: 0 },
          { say: "api-dl container'ını başlatıyoruz. Karttaki kullanıcıya bak: nonroot. Varsayılan olarak root değil.", cue: 1 },
          { say: "Ve sh ile içine girmeye çalışıyoruz… 127 ile reddedildi. Çünkü image'da sh diye bir program yok.", cue: 2 },
          { say: "Distroless image'da sadece uygulamanın runtime'ı var: kabuk yok, paket yöneticisi yok, curl yok. Bir saldırganın kullanabileceği araç çok az." },
          { say: "Karttaki programlar sayısına da bak. Ne kadar az program, güncellemen ve taraman gereken o kadar az şey demek." },
          { say: "Bedeli de var: içeride sorun gidermek zorlaşır, loglara ve dışarıdaki araçlara yaslanırsın. Peki taramak ne demek? Sonraki sayfada." },
        ],
      },
    },
    // 8 · Tarama
    {
      lines: [
        { say: "Bir image bugün temiz olabilir, ama base image'daki paketlerde zamanla açıklar bulunur. Bunlara CVE diyoruz." },
        { say: "Tarayıcılar image'daki paketleri bilinen açıkların veritabanlarıyla karşılaştırır. Docker Scout Docker'ın kendi aracı; Trivy de yaygın kullanılan açık kaynak bir alternatif." },
        { say: "En iyisi taramayı CI'ya koymak: yeni bir image yüksek dereceli bir açık taşıyorsa build kırılsın. Çözüm de çoğu zaman base image'ı güncellemek ya da daha küçüğüne geçmek." },
        { say: "Çalışırken de yetkiyi daraltabilirsin. read-only dosya sistemini salt okunur yapar, cap-drop ALL Linux yetkilerini kaldırır. privileged ise neredeyse hiçbir zaman gerekmez." },
        { say: "Dürüst olayım: bu sahnede gerçek bir tarama yapılmıyor, programlar sayısı sadece image'da kaç araç olduğunu gösteriyor. Anlatacaklarım bu kadar; sonraki sayfada sıra sende." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Sahne artık senin. Aşağıda bir terminal ve gerçek işten dört senaryo var." },
        { say: "Elinde bir API var. Anahtarı proje klasöründeki .env dosyasında duruyor, api container'ı da root olarak çalışıyor." },
        { say: "Dockerfile'ı nano ile, .dockerignore'u echo ile kendin düzenleyeceksin. Sonra yeniden build edip container'ı yeniden başlatacaksın." },
        { say: "İki komut çok işine yarar: docker exec api whoami kullanıcıyı gösterir, image'dan cat ile .env'i okumayı denemek de içeride sır kalmış mı, onu söyler." },
        { say: "Sahne katmanları gösterecek, sır taşıyanlar kırmızı yanacak. İpuçları adım adım açılıyor; az komutla bitirirsen üç yıldız. Hadi, kolay gelsin!" },
      ],
    },
  ],
};
