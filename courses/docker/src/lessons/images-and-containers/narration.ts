import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Image · sahne: pull nginx:1.27
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste Docker'ın en temel iki kavramını yan yana koyacağız: image ve container. Aralarındaki ilişki oturunca gerisi çok kolaylaşacak." },
        { say: "İlk iş, docker pull ile nginx'in 1.27 sürümünü indiriyoruz. Bak, solda rafa yerleşti: katman katman bir yığın, yanında da boyutu.", cue: 0 },
        { say: "Burada önemli bir nokta var: image çalışmaz, sadece durur. İçinde nginx programı, ihtiyaç duyduğu kütüphaneler ve küçük bir Linux dosya sistemi var, o kadar." },
        { say: "Programlamadan bir benzetme yapayım. Image bir sınıf gibi, container da ondan yaratılan nesne. Tek bir tanım, ondan istediğin kadar örnek." },
        { say: "Bir şey çalıştırmak istiyorsak bu image'dan bir container başlatmamız gerekiyor. Ama önce isimlere bir bakalım; sonraki sayfaya geç." },
      ],
    },
    // 1 · Ad ve tag · sahne: pull alpine:3.20
    {
      lines: [
        { say: "Az önce nginx iki nokta 1.27 dedik. Bu isim aslında iki parçadan oluşuyor." },
        { say: "Baştaki nginx, repository'nin adı. İki noktadan sonraki 1.27 de tag. Tag genelde sürümü söyler." },
        { say: "Bir image daha indirelim: alpine, tag'i 3.20. Rafa bak, artık iki image var.", cue: 0 },
        { say: "Tag yazmazsan Docker senin yerine latest varsayar. Yani sadece docker pull nginx dersen, aslında nginx iki nokta latest istemiş olursun." },
        { say: "Ama dikkat: latest en yeni demek değil, sadece bir isim. Neden riskli olduğunu registry dersinde konuşacağız. Şimdi gel, ilk container'ımızı açalım." },
      ],
    },
    // 2 · Container (tahmin: image'a ne olur?) · sahne: run web1
    {
      lines: [
        { say: "Rafta nginx 1.27 duruyor. Şimdi docker run ile ondan web1 adında bir container başlatacağız." },
        { say: "Soru şu: container başlayınca image'a ne olur? Container'a dönüşüp raftan mı gider, rafta durup container onun üstünde mi çalışır, yoksa ikinci bir kopyası mı indirilir?" },
      ],
      answer: {
        right: "İşte bu!",
        wrong: "Olsun, birlikte bakalım.",
        lines: [
          { say: "web1'i başlatıyoruz. Ortada yeşil ışıklı bir container belirdi, ve bak, image hâlâ rafta yerinde duruyor.", cue: 0 },
          { say: "Image değişmez, yerinden de kıpırdamaz. Container, image'ın üstüne kendi ince yazılabilir katmanını ekleyerek çalışır." },
          { say: "Container'ın kendi adı, kendi id'si ve kendi durumu var: çalışıyor ya da kapandı gibi. Image'ın bunların hiçbiri yok, o sadece bir şablon." },
          { say: "Bu arada docker ps container'ları, docker images ise image'ları listeler; ikisini karıştırma. Sonraki sayfada küçük bir deney yapacağız." },
        ],
      },
    },
    // 3 · Kendi katmanı (tahmin: web2 ve image değişikliği görür mü?) · sahne: run web2, web1'e yaz, curl 8080, curl 8081
    {
      lines: [
        { say: "Şimdi ikinci bir container açacağız, adı web2. Sonra web1'in içine girip ana sayfayı değiştireceğiz." },
        { say: "Sence bu değişikliği kim görür? Hem web2 hem image mi, hiçbiri mi, yoksa sadece web2 mi?" },
      ],
      answer: {
        right: "Harika, doğru!",
        wrong: "Güzel tahmin, ama öyle değil. İzle.",
        lines: [
          { say: "Önce web2'yi başlatıyoruz. Aynı image'dan, bu sefer 8081 portunda.", cue: 0 },
          { say: "Şimdi web1'in ana sayfasının içine \"web1 değişti\" yazıyoruz.", cue: 1 },
          { say: "web1'e 8080'den soralım… Cevap: web1 değişti. Beklediğimiz gibi.", cue: 2 },
          { say: "Bir de web2'ye 8081'den soralım… Varsayılan nginx cevabı geldi. Aynı image, iki farklı sonuç.", cue: 3 },
          { say: "Değişiklik sadece web1'in kendi katmanına gitti. Dosya image'da değişmez; container'ın üstteki katmanına kopyalanır, orada değişir. Buna copy-on-write deniyor." },
          { say: "Bu katman fikri çok önemli. Sonraki sayfada onu biraz daha yakından inceleyelim." },
        ],
      },
    },
    // 4 · Katmanlar
    {
      lines: [
        { say: "Bu sayfada sahnede yeni bir hareket yok, ama az önce gördüğümüz şeyin altını dolduralım." },
        { say: "Bir container'ın gördüğü dosya sistemi, üst üste konmuş katmanlardan oluşur. Altta image'ın salt okunur katmanları, en üstte de container'a ait tek bir yazılabilir katman." },
        { say: "web1 ile web2 aynı alt katmanları paylaşıyor, sadece en üstteki katmanları ayrı. web1'in değişikliği de onun kendi katmanında duruyor." },
        { say: "İşin güzel tarafı şu: yüz container aynı image'dan çalışsa bile image'ın katmanları diskte bir kez durur. Her container sadece kendi değişikliklerini taşır." },
        { say: "Container'ların hızlı başlayıp az yer kaplamasının sırrı bu. Peki kullanılan bir image'ı silmeye kalkarsak? Sonraki sayfada deneyelim." },
      ],
    },
    // 5 · rmi (tahmin: kullanılan image silinir mi?) · sahne: rmi nginx:1.27 (reddedilir)
    {
      lines: [
        { say: "web1 ve web2 hâlâ nginx 1.27'den çalışıyor. Şimdi biraz yaramazlık yapıp docker rmi ile bu image'ı silmeye çalışacağız." },
        { say: "Sence ne olur? Image silinip container'lar da mı gider, Docker reddeder mi, yoksa image silinir ama container'lar çalışmaya devam mı eder?" },
      ],
      answer: {
        right: "Tam olarak öyle!",
        wrong: "Çok kişi böyle düşünür, ama bak.",
        lines: [
          { say: "docker rmi diyoruz… ve Docker reddetti. Bir conflict hatası: bu image'ı kullanan bir container var. Image rafta duruyor.", cue: 0 },
          { say: "Mantığı basit: container'lar image'ın katmanlarının üstünde çalışıyor. Onlar durdukça Docker altlarındaki image'ı silmez." },
          { say: "Sıra her zaman aynı: önce docker rm ile container'ları kaldırırsın, sonra docker rmi ile image'ı." },
          { say: "Bir tuzak da var: kapanmış container'lar da sayılır. Onları görmek için docker ps komutuna tire a eklemen yeterli." },
          { say: "Bu arada bir image'ın birden fazla ismi de olabilir. Sonraki sayfada tag komutuna bakalım." },
        ],
      },
    },
    // 6 · tag · sahne: tag nginx:1.27 mysite:base, rmi mysite:base
    {
      lines: [
        { say: "Şimdi docker tag komutuyla tanışalım. Adı biraz kafa karıştırabilir, o yüzden ne yaptığına dikkatle bak." },
        { say: "nginx 1.27'ye mysite iki nokta base diye ikinci bir isim veriyoruz. Yeni bir image oluşmadı; aynı image'ın artık iki adı var.", cue: 0 },
        { say: "docker images'a baksan iki satır görürsün, ama ikisinin IMAGE ID'si aynıdır. Tag bir kopya değil, sadece bir isim etiketi." },
        { say: "Şimdi docker rmi ile mysite iki nokta base'i siliyoruz. Çıktıda Untagged yazıyor: sadece isim gitti, image öbür adıyla yerinde.", cue: 1 },
        { say: "Image'ın kendisi ancak son ismi de gidince ve onu kullanan container kalmayınca silinir. Sıradaki sayfada kendi image'ımızı yapacağız, en keyifli kısım geliyor." },
      ],
    },
    // 7 · Kendi image'ın · sahne: build mysite:1.0, run site, curl 8082
    {
      lines: [
        { say: "Şimdiye kadar hep başkalarının image'larını kullandık. Şimdi kendimizinkini yapalım, hem de sadece iki satırlık bir Dockerfile ile." },
        { say: "İlk satır FROM nginx 1.27: yani nginx'in üstüne kuruyoruz. İkinci satır COPY index.html: kendi sayfamızı içine koyuyoruz." },
        { say: "docker build ile mysite 1.0'ı oluşturuyoruz. Rafa bak: nginx'in katmanlarının üstüne bir katman daha eklendi, toplam 2 layer.", cue: 0 },
        { say: "Şimdi bu image'dan site adında bir container başlatıyoruz, 8082 portunda.", cue: 1 },
        { say: "Ve 8082'ye soruyoruz… Cevap: Benim sitem. Kendi image'ımız çalışıyor!", cue: 2 },
        { say: "Bu image'ı artık herhangi bir makinede aynı şekilde çalıştırabilirsin. Dockerfile'ın ayrıntılarına kendi bölümünde gireceğiz; şimdi geç, perde arkasına bir bakalım." },
      ],
    },
    // 8 · Gerçekte
    {
      lines: [
        { say: "Az önce bir şey dikkatini çekmiş olabilir: mysite, nginx'in katmanlarını kopyalamadı, onları doğrudan kullanıyor." },
        { say: "Aynı base image'ı kullanan on image düşün. Ortak katmanları diskte bir kez durur ve bir kez indirilir. docker pull sırasında Already exists satırlarını görmenin sebebi bu." },
        { say: "Bir de digest var. Image'lar içeriklerinden hesaplanan bir özetle tanınır, sha256 ile başlayan uzun bir değer. Tag'ler değişebilir, ama digest değişmez." },
        { say: "O yüzden tam olarak aynı image'ı istiyorsan, onu tag'iyle değil digest'iyle çekebilirsin." },
        { say: "Küçük bir dürüstlük notu: sahnedeki id'ler gerçek sha256 digest'leri değil, kısa özetler. Boyutlar da yuvarlanmış, yaklaşık değerler." },
        { say: "Anlatacaklarım bu kadar. Şimdi sıra sende, sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Şimdi sahne senin. Aşağıda bir terminal var, ve gerçek işten alınmış beş senaryo seni bekliyor." },
        { say: "Image indirmek, container'ın kendi katmanı, kullanımdaki bir image'ı silmek, yeni bir isim vermek ve kendi image'ını yapmak. Hepsini bu derste gördük." },
        { say: "Komutları kendin yazacaksın, sahne de her komutta ne olduğunu gösterecek. Unutma: docker images image'ları, docker ps tire a ise container'ları gösterir." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi, kolay gelsin!" },
      ],
    },
  ],
};
