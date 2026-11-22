import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · İki container · sahne: run web, run cache, bekle
    {
      lines: [
        { say: "Selam, yine buradayız! Bu derste container'ların birbirini nasıl bulduğunu konuşacağız: ağlar, ve isimle bulmayı sağlayan DNS." },
        { say: "web adında bir nginx başlatıyoruz.", cue: 0 },
        { say: "Yanına da cache adında bir Redis.", cue: 1 },
        { say: "Redis'in açılıp healthcheck'ten geçmesi için kısa bir an bekliyoruz.", cue: 2 },
        { say: "Ağ belirtmedik, o yüzden ikisi de Docker'ın varsayılan bridge ağında; çiplerinde bridge yazıyor. Bridge, bilgisayarının içinde container'lar için kurulmuş küçük bir sanal ağ ve her container orada kendi IP adresini alır." },
        { say: "Aynı ağdalar. Peki birbirlerini tanıyorlar mı? Sonraki sayfada soralım." },
      ],
    },
    // 1 · İsimle? (tahmin: cache bulunur mu?) · sahne: web'den ping cache
    {
      lines: [
        { say: "web'in içinden ping cache yapacağız. Yani web, cache'i adıyla arayacak." },
        { say: "Sence varsayılan bridge'de cache ismi bulunur mu? Docker adları her yerde çözer mi, burada isimle bulma yok mu, yoksa sadece aynı image'dan gelenler mi birbirini bulur?" },
      ],
      answer: {
        right: "Evet, doğru!",
        wrong: "Şaşırtıcı ama değil. Bak.",
        lines: [
          { say: "Ping'i atıyoruz… \"bad address cache\". İsim bulunamadı.", cue: 0 },
          { say: "Docker'ın isimle DNS'i sadece senin oluşturduğun ağlarda çalışır. Varsayılan bridge eski bir ağ; orada container'lar ancak IP adresiyle konuşur." },
          { say: "Sağda görüyorsun, ikisi aynı ağda duruyor; ama aynı ağda olmak, birbirinin adını bilmek demek değil." },
          { say: "IP ile bağlanmak da kırılgan, çünkü IP adresi her yeniden başlatmada değişebilir. Bugün çalışan ayar yarın bozulabilir." },
          { say: "O zaman kendi ağımızı kuralım. Sonraki sayfaya geç." },
        ],
      },
    },
    // 2 · Kendi ağın · sahne: network create shop, connect web, connect cache
    {
      lines: [
        { say: "docker network create ile yeni bir bridge ağı kuruyoruz. Adı shop.", cue: 0 },
        { say: "docker network connect ile web'i bu ağa bağlıyoruz.", cue: 1 },
        { say: "Ve cache'i de. Bak, ikisinin de artık bir shop çipi var, aralarında da kesikli bir çizgi belirdi.", cue: 2 },
        { say: "Bu arada, bir container aynı anda birden fazla ağda olabilir. Çalışan bir container'ı da böyle sonradan bir ağa bağlayabilirsin." },
        { say: "Yeni bir container'ı baştan bir ağda başlatmak istersen, network seçeneğine ağın adını vermen yeterli." },
        { say: "Hazırsan sonraki sayfada ping'i yeniden deneyelim." },
      ],
    },
    // 3 · İsimle bul (tahmin: ping cache şimdi?) · sahne: web'den ping cache
    {
      lines: [
        { say: "İkisi de artık shop ağında. Aynı denemeyi, web'in içinden ping cache'i tekrarlayacağız." },
        { say: "Sence bu sefer ne olur? Yine bad address mi, cache bulunur mu, yoksa önce Docker'ı yeniden başlatmak mı gerekir?" },
      ],
      answer: {
        right: "Harika, tam isabet!",
        wrong: "Olmadı, ama hiç dert etme. İzle.",
        lines: [
          { say: "Ping'i atıyoruz… ve cevap geldi. cache bulundu.", cue: 0 },
          { say: "Kendi kurduğun ağlarda Docker'ın küçük bir DNS sunucusu var, adresi 127.0.0.11. Container adlarını IP'ye o çevirir. Az önceki kesikli çizgi de tam bunu gösteriyordu." },
          { say: "En güzeli: container yeniden başlayıp IP'si değişse bile ismi aynı kalır. Uygulamanın ayarında, mesela REDIS_URL'de, artık IP yerine doğrudan cache yazabilirsin." },
          { say: "Docker Compose bunu senin yerine kendiliğinden yapar: her proje için bir ağ kurar, servisleri adlarıyla bağlar. Onu Compose bölümünde göreceğiz." },
          { say: "Şimdi portlar işin içine girince ne oluyor, ona bakalım. Sonraki sayfaya geç." },
        ],
      },
    },
    // 4 · -p gerekmez (tahmin: web api'ye ulaşır mı?) · sahne: run api --network shop, web'den curl api, host'tan curl 80
    {
      lines: [
        { say: "Geçen derste -p ile kapı açmayı öğrendik. Şimdi api adında bir nginx'i shop ağında, hiç -p vermeden başlatacağız." },
        { say: "Sence web, ona curl http api ile ulaşabilir mi? Port yayınlanmadığı için hayır mı, aynı ağdakiler doğrudan ulaşır mı, yoksa sadece büyük P ile mi?" },
      ],
      answer: {
        right: "Süper, doğru bildin!",
        wrong: "Mantıklı bir düşünce, ama değil. Bakalım.",
        lines: [
          { say: "api'yi shop ağında, port vermeden başlatıyoruz. Altında hiç port etiketi yok.", cue: 0 },
          { say: "web'in içinden curl http api… cevap geldi.", cue: 1 },
          { say: "Şimdi de kendi bilgisayarımızdan localhost 80'i deniyoruz… reddedildi.", cue: 2 },
          { say: "Yani -p sadece host'tan container'a giriş için. Aynı ağdaki container'lar birbirine doğrudan, container portuyla bağlanır." },
          { say: "Bu çok iyi bir şey: veritabanı, cache, iç API'ler dışarıya hiç açılmadan sadece onları kullananlara görünür. Dışarı sadece gerçekten gereken açılır, çoğu zaman tek bir web girişi." },
          { say: "Peki ağın dışında kalan biri ne görür? Sonraki sayfada." },
        ],
      },
    },
    // 5 · Yalıtım · sahne: run other, other'dan ping cache
    {
      lines: [
        { say: "other adında yeni bir nginx'i hiç ağ belirtmeden başlatıyoruz. Yani o, varsayılan bridge'de.", cue: 0 },
        { say: "other'ın içinden ping cache… \"bad address\". Bulamadı.", cue: 1 },
        { say: "shop'ta olmayan biri, shop'takileri isimle bulamaz. Yani ağlar aynı zamanda bir yalıtım aracı." },
        { say: "Mesela frontend ve backend diye iki ağ kurarsın. Veritabanı sadece backend'de durur, web sunucusu ikisinde birden. Veritabanına da sadece backend'dekiler ulaşır." },
        { say: "Yani hangi servisin kiminle konuşabileceğine, onları hangi ağlara koyduğunla sen karar verirsin." },
        { say: "Şimdi bridge'in dışındaki iki ağ türüne geçelim." },
      ],
    },
    // 6 · host ve none (tahmin: -p'ye ne olur?) · sahne: run hostnet --network host, run isolated --network none
    {
      lines: [
        { say: "Her Docker kurulumunda üç ağ hazır gelir: bridge, host ve none. Bridge'i tanıdık, şimdi sıra diğer ikisinde." },
        { say: "nginx'i host ağında ve -p 8080:80 ile başlatacağız. Sence bu -p'ye ne olur? Her zamanki gibi mi çalışır, yok mu sayılır, yoksa Docker hata verip başlatmaz mı?" },
      ],
      answer: {
        right: "Evet, aynen öyle!",
        wrong: "Olmadı, ama bu çok sık karışır. Bak.",
        lines: [
          { say: "hostnet'i host ağında başlatıyoruz. Altına bak: port etiketi yok.", cue: 0 },
          { say: "Host ağında container'ın kendine ait bir ağı yoktur; nginx doğrudan host'un 80'ini dinler. Eşlenecek bir şey kalmadığı için -p yok sayılır, gerçekte Docker bir de uyarı yazar." },
          { say: "Şimdi de isolated'ı none ağında başlatıyoruz. None, hiç ağ yok demek; sadece kendi içinde çalışan işler için.", cue: 1 },
          { say: "Toparlarsak: bridge varsayılan, dışarıya -p ile açılır. Host, host'un ağını paylaşır. None ise hiç ağ vermez." },
          { say: "Küçük bir not: host ağı Linux'ta tam çalışır. Mac ve Windows'taki Docker Desktop'ta container'lar bir sanal makinede döndüğü için farklı davranır, ayarlardan ayrıca açılması gerekir. Geçelim." },
        ],
      },
    },
    // 7 · Gerçekte
    {
      lines: [
        { say: "Biraz da günlük hayattan konuşalım. docker network inspect, bir ağdaki container'ları ve IP'lerini gösterir." },
        { say: "Bir container'a ağ içinde ek bir isim de verebilirsin, network alias ile. Böylece aynı servisin farklı sürümleri aynı adla çağrılabilir." },
        { say: "Bir dürüstlük notu: bu sahnede ping ve curl sadece isim çözümünü deniyor. Gerçek image'ların bir kısmında, mesela resmi nginx ve redis image'larında, bu araçlar yok." },
        { say: "O yüzden denemeyi geçici bir alpine container'ından yapmak en kolayı." },
        { say: "İşin bitince de toparlayabilirsin: docker network disconnect bir container'ı ağdan çıkarır, docker network rm de ağı siler; tabii bağlı container kalmadıysa." },
        { say: "Günlük kuralın şu olsun: birlikte çalışan servisler için bir ağ kur ya da Compose'a kurdur, servisleri isimle çağır, dışarıya sadece gereken portu aç. Anlatacaklarım bu kadar; sonraki sayfaya geç." },
      ],
    },
    // 8 · Sen dene
    {
      lines: [
        { say: "Terminal senin. Gerçek işten dört senaryo var: container'ları isimle buluşturmak, birini ağın dışında tutmak, port açmadan bir iç servis kurmak ve geçici bir kontrol container'ı." },
        { say: "Komutları kendin yazacaksın; sahne hangi container'ın hangi ağda olduğunu renkli çiplerle gösterecek." },
        { say: "İki komut çok işine yarar: docker network ls ağları listeler, docker exec ile ping de bir ismin bulunup bulunmadığını gösterir." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi, container'larını tanıştır!" },
      ],
    },
  ],
};
