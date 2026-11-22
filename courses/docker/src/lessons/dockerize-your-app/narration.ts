import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Proje
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste kendi projeni adım adım bir image'a çevireceğiz. Sonunda elinde her makinede aynı çalışan bir tarif olacak." },
        { say: "Sağda küçük bir Node web dükkânının klasörü var: package.json, kilit dosyası, server.js ve bir index.html. Yani uygulamanın kendisi." },
        { say: "Bir de her projede olan üç misafir var: 200 megabaytlık node_modules, .git klasörü ve şifrelerin durduğu .env dosyası. Bunları aklında tut, birazdan başımızı ağrıtacaklar." },
        { say: "Amacımız şu: bu klasörden öyle bir image çıkaralım ki, hangi bilgisayarda olursa olsun docker run ile aynı şekilde çalışsın." },
        { say: "Her adımı kendi projende de yapabilirsin; tarifin tamamı en sondaki kutuda. Hazırsan ilk adıma geçelim." },
      ],
    },
    // 1 · Base image (tahmin: hangisi küçük?) · sahne: node:22 ve node:22-slim indir
    {
      lines: [
        { say: "Her Dockerfile bir FROM satırıyla başlar. Yani sıfırdan başlamazsın, hazır bir image'ın üstüne inşa edersin. Buna base image diyoruz." },
        { say: "Node için iki aday indireceğiz: node:22 ve node:22-slim. Sence hangisi daha küçük? Düz olan mı, slim olan mı, yoksa ikisi aynı boyutta mı?" },
      ],
      answer: {
        right: "Bingo, doğru seçim!",
        wrong: "Olsun, isimler yanıltabiliyor. Bak.",
        lines: [
          { say: "Önce node:22'yi indiriyoruz. Yaklaşık 1100 megabayt, çünkü içinde derleyiciler ve araçlarla dolu koca bir Debian var.", cue: 0 },
          { say: "Şimdi node:22-slim. Bu sefer yaklaşık 240 megabayt; sadece Node'u çalıştırmak için gerekeni taşıyor.", cue: 1 },
          { say: "Kuralımız basit: dilinin resmi image'ını al, sürümünü açıkça yaz, latest deme, ve önce slim'i dene." },
          { say: "Alpine diye daha da küçük bir seçenek de var. Ama musl kullandığı için bazı yerel bağımlılıklar orada derlenmeyebilir." },
          { say: "Base image hazır. Sonraki sayfada bilerek küçük bir kaza yapacağız." },
        ],
      },
    },
    // 2 · İgnore yok (tahmin: node_modules ve .env girer mi?) · sahne: her şeyi kopyalayan build
    {
      lines: [
        { say: "Şimdi bilerek bir hata yapalım ki farkı görelim. Projede .dockerignore yok, Dockerfile'daki COPY satırı da klasörün tamamını kopyalıyor." },
        { say: "Soru şu: node_modules ve .env image'a girer mi? Docker onları kendiliğinden atlar mı, ikisi de girer mi, yoksa sadece node_modules mu?" },
      ],
      answer: {
        right: "Evet, maalesef öyle!",
        wrong: "Keşke öyle olsaydı. İzleyelim.",
        lines: [
          { say: "Build başlıyor. Docker klasördeki her şeyi build'e gönderiyor, COPY satırı da hepsini image'a kopyalıyor.", cue: 0 },
          { say: "Sonuç: image şişti, çünkü yerel node_modules'ın 200 megabaytı da içeride. Üstelik o klasör senin makinende, belki başka bir işletim sistemi için derlendi. Bağımlılıklar image'ın içinde kurulmalı." },
          { say: "Asıl kötü haber .env. Bu image'ı registry'ye gönderen herkes, içindeki Stripe anahtarını da göndermiş olur." },
          { say: "Ve dikkat: sonradan RUN rm .env eklemek onu silmez, eski katmanda durmaya devam eder. Sızdıysa tek çare anahtarı yenilemek." },
          { say: "Hadi bunu doğru yapalım; sonraki sayfaya geç." },
        ],
      },
    },
    // 3 · .dockerignore · sahne: tarifle build
    {
      lines: [
        { say: "Çare çok basit bir dosya. Proje köküne bir .dockerignore koyuyoruz ve içine node_modules, .git ve .env yazıyoruz." },
        { say: "Sağda bak, bu üçü artık dışarıda diye işaretli. Build'e hiç gönderilmiyorlar." },
        { say: "Şimdi tarifin kendisiyle build ediyoruz. Önce sadece package.json ve kilit dosyası kopyalanıyor, sonra npm ci bağımlılıkları kuruyor, kaynak kod en sona kalıyor.", cue: 0 },
        { say: "Sonuç yaklaşık 300 megabaytlık bir image, ve içinde tek bir sır yok. npm ci kilit dosyasındaki tam sürümleri kurar, geliştirme paketlerini de almaz." },
        { say: "Peki bu sıralama neden bu kadar önemli? Cevabı bir sonraki sayfada." },
      ],
    },
    // 4 · Cache (tahmin: npm ci tekrar çalışır mı?) · sahne: index.html'i değiştir, yeniden build
    {
      lines: [
        { say: "Günlük hayattan bir an. Sadece index.html'de küçük bir değişiklik yapıp yeniden build edeceğiz." },
        { say: "Sence npm ci tekrar çalışır mı? Her build'de mi çalışır, cache'ten mi gelir, yoksa build hata mı verir?" },
      ],
      answer: {
        right: "Süper, tam olarak bu!",
        wrong: "Güzel tahmin, ama değil. Bak ne oluyor.",
        lines: [
          { say: "index.html'i değiştiriyoruz; sayfa artık v2 diyor.", cue: 0 },
          { say: "Ve yeniden build. Bak, npm ci satırı CACHED yazıyor. Sadece son COPY satırı çalıştı, build birkaç saniyede bitti.", cue: 1 },
          { say: "Neden? npm ci'dan önceki satırlar sadece package.json'a ve kilit dosyasına bakıyor, onlar değişmedi. Değişen dosya ancak en sondaki COPY'de devreye giriyor." },
          { say: "Günde onlarca kez build ediyorsan bu, dakikalar demek. Fikir her dilde aynı: Python'da requirements.txt, PHP'de composer.json, .NET'te csproj dosyası önce kopyalanır." },
          { say: "Hızı hallettik. Sıradaki konu güvenlik; sonraki sayfaya geçelim." },
        ],
      },
    },
    // 5 · USER (tahmin: whoami ne der?) · sahne: shop'u başlat, içinde whoami
    {
      lines: [
        { say: "Tarifimizde USER node diye bir satır vardı. Şimdi container'ı başlatıp içine soracağız: sen kimsin?" },
        { say: "whoami komutu ne cevap verir sence? root mu, node mu, yoksa senin bilgisayarındaki kullanıcı adın mı?" },
      ],
      answer: {
        right: "Aynen, node!",
        wrong: "Çok yaygın bir tahmin bu. Gel bakalım.",
        lines: [
          { say: "docker run ile shop container'ını arka planda başlatıyoruz.", cue: 0 },
          { say: "Şimdi içinde whoami çalıştırıyoruz. Cevap: node.", cue: 1 },
          { say: "USER satırından sonraki her şey o kullanıcıyla çalışır, container'ın ana süreci de. Resmi Node image'larında bu node kullanıcısı zaten hazır gelir." },
          { say: "Faydası şu: uygulamada bir açık çıksa bile saldırgan container'ın içinde root olamaz. Güvenlikte bundan ucuz ve etkili bir adım zor bulunur." },
          { say: "Container çalışıyor. Bakalım sayfayı açabilecek miyiz; sonraki sayfaya geç." },
        ],
      },
    },
    // 6 · EXPOSE ≠ -p (tahmin: curl çalışır mı?) · sahne: curl localhost:3000
    {
      lines: [
        { say: "Dockerfile'da EXPOSE 3000 satırı da var. Ama container'ı az önce port ayarı vermeden, yani -p olmadan başlattık." },
        { say: "Şimdi curl ile localhost 3000'e istek atacağız. Çalışır mı sence? EXPOSE portu açar mı, bağlantı reddedilir mi, yoksa sadece tarayıcıdan mı olur?" },
      ],
      answer: {
        right: "Doğru, kapı kapalı!",
        wrong: "Çoğu kişi buna takılır. İzle.",
        lines: [
          { say: "curl ile istek atıyoruz… Connection refused. Bağlantı reddedildi.", cue: 0 },
          { say: "EXPOSE aslında sadece bir not. Image'a, bu uygulama 3000'i dinler diye yazar. Compose gibi araçlar bu notu okur, ama tek başına hiçbir kapı açmaz." },
          { say: "Portu host'a açan, docker run'a verdiğin -p'dir. Kısacası EXPOSE bir belge, -p ise kapının kendisi." },
          { say: "Peki kapıyı nasıl açarız? Sonraki sayfada." },
        ],
      },
    },
    // 7 · Çalıştır · sahne: rm -f, -p ile run, curl
    {
      lines: [
        { say: "Şimdi kapıyı gerçekten açalım." },
        { say: "Önce eski container'ı docker rm ile zorla siliyoruz.", cue: 0 },
        { say: "Sonra aynı image'dan, bu sefer -p ile host'un 3000'ini container'ın 3000'ine bağlayarak yeniden başlatıyoruz.", cue: 1 },
        { say: "Ve curl… Cevap geldi: Merhaba v2. Kod, image ve port uç uca çalışıyor.", cue: 2 },
        { say: "Kod her değiştiğinde döngü aynı: build et, eski container'ı sil, yenisini başlat, curl ile dene. Çünkü yeni kod, yeni image ve yeni container demek." },
        { say: "Bunu her seferinde elle yapmak yorucu; Compose bölümü ve dev/prod dersi işini kolaylaştıracak. Şimdi başka dillere bir göz atalım." },
      ],
    },
    // 8 · Diğer diller
    {
      lines: [
        { say: "Bu tarif sadece Node'a özel değil. Resmi base image, .dockerignore, önce bağımlılık dosyası, kurulum, sonra kod, root olmayan kullanıcı, EXPOSE ve CMD. Her dilde aynı sıra." },
        { say: "Soldaki kutuda Python, PHP ve .NET için hazır Dockerfile'lar var. Mesela .NET örneği SDK ile derliyor, sadece runtime ile çalıştırıyor." },
        { say: "Başlamak için bir kestirme de var: projenin kökünde docker init çalıştır. Dilini sorar, senin için Dockerfile, compose.yaml ve .dockerignore üretir. Sonra yine bu dersteki kurallarla kontrol edersin." },
        { say: "Bir uyarı, çünkü en sık yapılan hata bu: container içindeki uygulama 127.0.0.1'i değil, 0.0.0.0'ı dinlemeli. Yoksa -p versen bile dışarıdan ulaşamazsın." },
        { say: "Bir de dürüstlük notu: sahnedeki build süreleri ve boyutlar yuvarlak sayılar. Kendi projende ilk build'i bir kez ölç, sonra cache farkını gör." },
        { say: "Anlatacaklarım bu kadar. Şimdi sıra sende, sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Burası senin sahan. Klasörde küçük bir Express uygulaması var; yanında yerel node_modules, .git ve sır içeren bir .env de duruyor." },
        { say: "Aşağıdaki terminalde gerçek işten alınmış beş senaryo seni bekliyor. Dockerfile'ı nano ile kendin yazacaksın, sonra docker build ve docker run ile deneyeceksin." },
        { say: "Takılırsan cat Dockerfile ve docker images çok işine yarar; curl localhost 3000 de sayfayı gösterir." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi, ilk image'ın senden!" },
      ],
    },
  ],
};
