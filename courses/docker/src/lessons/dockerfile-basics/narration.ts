import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · FROM · sahne: build (FROM)
    {
      lines: [
        { say: "Tekrar hoş geldin! Bugün kendi image'ını yapacağız. Bunun için satır satır bir Dockerfile yazacağız." },
        { say: "Dockerfile bir image'ın tarifidir. Yukarıdan aşağı okunur, her satır bir adım." },
        { say: "İlk satır her zaman FROM, yani şu hazır image'ın üstüne kur. Biz node 22 slim seçiyoruz: içinde Node.js kurulu, küçük bir Linux." },
        { say: "Bu tek satırlık Dockerfile'ı build ediyoruz. Sağda image'ın ilk ve tek layer'ı belirdi: yaklaşık 240 megabayt, hepsi base image'dan.", cue: 0 },
        { say: "Bir alışkanlık edin: tag'i hep yaz. Sadece node yazarsan bu latest demek, latest de bir gün sessizce başka bir sürüme döner." },
        { say: "Kendi makinende denemek istersen docker build -t my-app nokta yazarsın. -t image'a ad verir, sondaki nokta da build context, yani Dockerfile'ın görebildiği klasör." },
        { say: "Şimdi bu temelin üstüne dosyalarımızı koyalım. Sonraki sayfaya geç." },
      ],
    },
    // 1 · WORKDIR, COPY · sahne: build (+ WORKDIR, COPY package*.json)
    {
      lines: [
        { say: "İki satır ekliyoruz. İlki WORKDIR /app: image'ın içindeki çalışma klasörünü seçer, yoksa oluşturur. Sonraki satırlar hep oraya göre çalışır." },
        { say: "İkincisi COPY: package.json ve package-lock.json'ı senin klasöründen image'daki /app klasörüne kopyalar." },
        { say: "Build ediyoruz. Bak, sağda ikinci bir kat belirdi: COPY image'a yeni bir layer ekledi.", cue: 0 },
        { say: "Bu iki dosyayı neden kodun geri kalanından ayrı, en başta kopyaladık? Şimdilik aklında bir soru olarak kalsın." },
        { say: "Dosyalar içeride. Sıra bağımlılıkları kurmakta, geçelim." },
      ],
    },
    // 2 · RUN (tahmin: image'a ne olur?) · sahne: build (+ RUN npm ci)
    {
      lines: [
        { say: "Elimizde package.json var, ama bağımlılıklar henüz kurulmadı. Dockerfile'a RUN npm ci satırını ekleyip yeniden build edeceğiz." },
        { say: "Sence image'a ne olur? Hiçbir şey değişmez mi, yeni bir layer mı eklenir, yoksa her container başladığında npm ci mi çalışır?" },
      ],
      answer: {
        right: "Harika, doğru bildin!",
        wrong: "Güzel düşünce, ama değil. Birlikte bakalım.",
        lines: [
          { say: "Build ediyoruz. RUN satırının yanında çalıştı, 20 saniye yazıyor: npm ci bağımlılıkları kurdu.", cue: 0 },
          { say: "Ve sağda yeni bir layer var. Image yaklaşık 60 megabayt büyüdü." },
          { say: "RUN, build sırasında bir komut çalıştırır ve yaptığı değişiklikleri yeni bir layer olarak kaydeder. Kurulan paketler image'ın parçası olur." },
          { say: "Yani container başlarken paketler yeniden kurulmaz, her container onları hazır bulur." },
          { say: "Neden npm install değil de npm ci? Çünkü npm ci, package-lock.json'a birebir uyar, kurulum her seferinde aynı çıkar. Gerçek bir prod image'a da geliştirme paketlerini koymazsın. Şimdi uygulamanın kendisini içeri alalım, sonraki sayfada." },
        ],
      },
    },
    // 3 · COPY . . · sahne: build (+ COPY . .)
    {
      lines: [
        { say: "Şimdi sıra uygulamanın kendisinde: COPY nokta nokta." },
        { say: "Build ediyoruz. Klasördeki her şey image'daki çalışma klasörüne, yani /app'e kopyalandı.", cue: 0 },
        { say: "server.js artık /app/server.js olarak image'ın içinde duruyor." },
        { say: "Hatırlarsan package.json'ı ayrı ve en başta kopyalamıştık, bütün klasörü ise en sona bıraktık. Neden böyle? Cevap build cache'te, ve bir sonraki derste tam olarak bunu göreceğiz." },
        { say: "Bu arada gerçek projende de kural aynı: kodu her değiştirdiğinde image'ı yeniden build edersin." },
        { say: "Dosyalar tamam. Şimdi image'a birkaç ayar ekleyelim, geçelim." },
      ],
    },
    // 4 · ENV, EXPOSE, CMD (tahmin: kaç yeni layer?) · sahne: build (+ ENV, EXPOSE, CMD)
    {
      lines: [
        { say: "Üç satır daha ekleyeceğiz: NODE_ENV'i production yapan bir ENV, EXPOSE 3000 ve node server.js'i çalıştıran bir CMD." },
        { say: "Önceki adımlarda COPY ve RUN birer layer ekledi. Peki bu üç satırla image kaç yeni layer kazanır? Üç mü, bir mi, yoksa hiç mi?" },
      ],
      answer: {
        right: "Süper, tam isabet!",
        wrong: "Akla yatkın, ama hayır. Bak.",
        lines: [
          { say: "Build ediyoruz. Image'ın boyutu da layer sayısı da değişmedi; üç satırın yanında layer yok yazıyor.", cue: 0 },
          { say: "Çünkü bu satırlar dosya sistemine dokunmaz, image'ın ayarlarına yazılır. WORKDIR ve USER da böyledir." },
          { say: "ENV, container'ın içinde bir ortam değişkeni tanımlar. CMD de container başlayınca çalışacak komuttur." },
          { say: "EXPOSE ise sadece belgeler: bu uygulama 3000'i dinler der, portu dışarı açmaz. O iş docker run -p'nin." },
          { say: "Bunu kendi image'ında da görebilirsin: docker history her satırı boyutuyla listeler, ayar satırlarının boyutu sıfır bayttır." },
          { say: "Bir ipucu: CMD'yi JSON biçiminde, köşeli parantezle yaz. Düz yazımda komut bir shell üzerinden çalışır ve durdurma sinyalleri uygulamana ulaşmayabilir. Sonraki sayfada ARG var." },
        ],
      },
    },
    // 5 · ARG (tahmin: --build-arg ile ne olur?) · sahne: build (APP_VERSION=1), build (APP_VERSION=2)
    {
      lines: [
        { say: "Bazen build sırasında dışarıdan bir değer vermek istersin. Bunun için ARG var. Dockerfile'ın ikinci satırında ARG APP_VERSION=1 duruyor, sonraki bir RUN da bu değeri bir dosyaya yazıyor." },
        { say: "Önce varsayılan değerle build edeceğiz, sonra aynı Dockerfile'ı --build-arg APP_VERSION=2 ile tekrar. İkincide ne olur sence? Hepsi cache'ten mi gelir, ARG'den sonraki adımlar mı yeniden çalışır, yoksa sadece FROM mu yeniden iner?" },
      ],
      answer: {
        right: "Çok iyi, doğru!",
        wrong: "Kolay bir tuzak değildi. İzle.",
        lines: [
          { say: "İlk build, varsayılan değer olan 1 ile.", cue: 0 },
          { say: "Şimdi APP_VERSION 2 ile tekrar. FROM cache'ten geldi, ama ARG satırından sonraki her şey yeniden çalıştı.", cue: 1 },
          { say: "Çünkü ARG'nin değeri build'in bir parçası. Değer değişince sonraki RUN'lar farklı bir ortamda çalışır, Docker da onları cache'ten alamaz." },
          { say: "ARG sadece build sırasında vardır, çalışan container onu görmez. Container'a da lazımsa değeri bir ENV'e aktarırsın." },
          { say: "Ve önemli bir uyarı: şifreyi ARG ile verme, değeri docker history ile görülebilir. Build sırasında gizli bilgi gerekiyorsa secret mount kullanılır. Hadi, sonraki sayfaya." },
        ],
      },
    },
    // 6 · ADD mi COPY mi?
    {
      lines: [
        { say: "Bir de ADD var. O da dosya kopyalar, ama COPY'nin fazla bilen kardeşi gibidir." },
        { say: "İki şeyi fazladan yapar: bir URL'den dosya indirebilir, ve yerel bir tar arşivini, sıkıştırılmış olsa bile, hedefe açar." },
        { say: "Bu fazlalık sürpriz demek. Arşivi olduğu gibi kopyalamak isterken, içeride açılmış halde bulursun." },
        { say: "Kural basit: normalde COPY kullan, ADD'i sadece bir tar'ı açmak için seç. URL'den bir şey lazımsa çoğu zaman RUN ile curl daha açıktır, ne indirdiğin Dockerfile'da görünür." },
        { say: "Bu sahnede ADD, COPY gibi davranıyor; arşiv açma ve indirme modellenmedi. Şimdi son bir build yapalım, sonraki sayfaya geç." },
      ],
    },
    // 7 · Gerçekte · sahne: aynı Dockerfile'ı yeniden build
    {
      lines: [
        { say: "Tam Dockerfile'ımız hazır. Hiçbir şeyi değiştirmeden bir kez daha build edelim." },
        { say: "Build ediyoruz… ve her satır CACHED. Süre sıfır saniye.", cue: 0 },
        { say: "Hiçbir şey değişmediyse Docker aynı işi tekrar yapmaz, önceki sonuçları kullanır." },
        { say: "Soldaki notlarda bir Node ve bir Python projesi için başlangıç Dockerfile'ları var. Kendi projende build edip docker run -p 3000:3000 ile çalıştırabilirsin." },
        { say: "Bir dürüstlük notu: gerçek Docker build için BuildKit kullanır ve bağımsız adımları paralel çalıştırır. Burada adımlar sırayla gösteriliyor, saniyeler de yuvarlak sayılar." },
        { say: "Anlatacaklarım bu kadar. Sonraki sayfada Dockerfile'ı sen yazacaksın." },
      ],
    },
    // 8 · Sen dene
    {
      lines: [
        { say: "Sıra sende! Proje klasöründe package.json, package-lock.json ve server.js hazır duruyor." },
        { say: "Aşağıdaki terminalde gerçek işten beş senaryo var. Dockerfile'ı nano ile kendin yazacak, docker build ile build edeceksin. Sahne her satırın ne yaptığını gösterecek." },
        { say: "cat Dockerfile dosyanın son halini, docker images da image'ların boyutunu gösterir. Takılırsan önce bu ikisine bak." },
        { say: "Editörü kaydetmek bir komut sayılıyor. İpuçları adım adım açılıyor; az komutla bitirirsen üç yıldız. Hadi, ilk Dockerfile'ın seni bekliyor!" },
      ],
    },
  ],
};
