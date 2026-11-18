import { l, type L } from "@lets-explain/core/i18n";

const display = { fontFamily: "var(--font-display)", fontWeight: 800, fill: "var(--ink)" } as const;
const sans = { fontFamily: "var(--font-sans)", fontWeight: 700, fill: "var(--ink-2)" } as const;
const mono = { fontFamily: "var(--font-mono)", fontWeight: 700, fill: "var(--ink)" } as const;

function Card({ x, y, w, h, fill, children }: { x: number; y: number; w: number; h: number; fill: string; children: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={5} width={w} height={h} rx={20} style={{ fill: "var(--ink)" }} />
      <rect width={w} height={h} rx={20} style={{ fill, stroke: "var(--ink)", strokeWidth: 2 }} />
      {children}
    </g>
  );
}

/** Good: one long-lived connection with a channel per thread. Bad: a new connection per message. */
export function ConnectionsPanel({ t }: { t: (x: L) => string }) {
  const lines = (x0: number, n: number, y0: number, gap: number, dashed: boolean) =>
    Array.from({ length: n }, (_, i) => (
      <path key={i} d={`M${x0} ${y0 + i * gap} C ${x0 + 70} ${y0 + i * gap}, ${x0 + 80} 210, ${x0 + 150} 210`} style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 2, strokeDasharray: dashed ? "4 4" : undefined }} />
    ));
  return (
    <g>
      <Card x={30} y={40} w={385} h={390} fill="var(--mint-soft)">
        <text x={22} y={42} style={{ ...display, fontSize: 24 }}>
          {t(l("İyi", "Good"))}
        </text>
        <text x={22} y={70} style={{ ...sans, fontSize: 15 }}>
          {t(l("1 uzun ömürlü bağlantı, iş parçacığı başına 1 kanal", "1 long-lived connection, 1 channel per thread"))}
        </text>
        <rect x={22} y={120} width={110} height={180} rx={14} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
        <text x={77} y={145} textAnchor="middle" style={{ ...display, fontSize: 15 }}>
          {t(l("Uygulama", "App"))}
        </text>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={40} y={165 + i * 40} width={74} height={26} rx={13} style={{ fill: "var(--sky-soft)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
            <text x={77} y={183 + i * 40} textAnchor="middle" style={{ ...mono, fontSize: 12 }}>
              {`channel ${i + 1}`}
            </text>
          </g>
        ))}
        <path d="M132 210 H 250" style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 7, strokeLinecap: "round" }} />
        <text x={190} y={196} textAnchor="middle" style={{ ...mono, fontSize: 12 }}>
          1 TCP
        </text>
        <rect x={250} y={170} width={110} height={80} rx={14} style={{ fill: "var(--peach)", stroke: "var(--ink)", strokeWidth: 2 }} />
        <text x={305} y={216} textAnchor="middle" style={{ ...display, fontSize: 16 }}>
          RabbitMQ
        </text>
        <text x={22} y={345} style={{ ...sans, fontSize: 14 }}>
          {t(l("Bağlantı pahalı (TCP + TLS + giriş); kanal ucuz.", "Connections are costly (TCP + TLS + login); channels are cheap."))}
        </text>
      </Card>
      <Card x={445} y={40} w={385} h={390} fill="var(--red-soft)">
        <text x={22} y={42} style={{ ...display, fontSize: 24 }}>
          {t(l("Kötü", "Bad"))}
        </text>
        <text x={22} y={70} style={{ ...sans, fontSize: 15 }}>
          {t(l("Her mesaj için yeni bağlantı aç, gönder, kapat", "Open a new connection per message, send, close"))}
        </text>
        <rect x={22} y={120} width={110} height={180} rx={14} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
        <text x={77} y={145} textAnchor="middle" style={{ ...display, fontSize: 15 }}>
          {t(l("Uygulama", "App"))}
        </text>
        <g transform="translate(100 0)">{lines(32, 7, 160, 18, true)}</g>
        <rect x={250} y={170} width={110} height={80} rx={14} style={{ fill: "var(--peach)", stroke: "var(--ink)", strokeWidth: 2 }} />
        <text x={305} y={216} textAnchor="middle" style={{ ...display, fontSize: 16 }}>
          RabbitMQ
        </text>
        <text x={22} y={345} style={{ ...sans, fontSize: 14 }}>
          {t(l("Binlerce bağlantı: broker belleği ve CPU'su erir.", "Thousands of connections: broker memory and CPU melt."))}
        </text>
      </Card>
    </g>
  );
}

/** Memory and disk alarms: past a threshold the broker blocks publishers, consumers keep going. */
export function AlarmPanel({ t }: { t: (x: L) => string }) {
  const bar = (x: number, y: number, label: string, fillPct: number, mark: number, markLabel: string, alarm: boolean) => (
    <g transform={`translate(${x} ${y})`}>
      <text y={-14} style={{ ...display, fontSize: 18 }}>
        {label}
      </text>
      <rect width={340} height={34} rx={17} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <rect x={2} y={2} width={(336 * fillPct) / 100} height={30} rx={15} style={{ fill: alarm ? "var(--red)" : "var(--mint-mid)" }} />
      <line x1={(340 * mark) / 100} x2={(340 * mark) / 100} y1={-6} y2={40} style={{ stroke: "var(--ink)", strokeWidth: 3 }} />
      <text x={(340 * mark) / 100} y={62} textAnchor="middle" style={{ ...mono, fontSize: 12.5 }}>
        {markLabel}
      </text>
    </g>
  );
  return (
    <g>
      <Card x={30} y={36} w={520} h={400} fill="var(--sun-soft)">
        {bar(30, 80, t(l("Bellek", "Memory")), 66, 60, "vm_memory_high_watermark = 0.6", true)}
        {bar(30, 210, t(l("Boş disk", "Free disk")), 80, 15, "disk_free_limit = 50MB", false)}
        <text x={30} y={330} style={{ ...sans, fontSize: 15 }}>
          {t(l("Bellek sınırı aşıldı: alarm çalıyor.", "Memory is past its limit: the alarm is on."))}
        </text>
        <text x={30} y={356} style={{ ...sans, fontSize: 15 }}>
          {t(l("Disk alarmı, boş alan sınırın altına düşünce çalar.", "The disk alarm fires when free space drops below its limit."))}
        </text>
      </Card>
      <Card x={575} y={36} w={255} h={190} fill="var(--red-soft)">
        <text x={20} y={40} style={{ ...display, fontSize: 19 }}>
          {t(l("Producer'lar", "Producers"))}
        </text>
        <text x={20} y={78} style={{ ...mono, fontSize: 14 }}>
          connection.blocked
        </text>
        <text x={20} y={112} style={{ ...sans, fontSize: 14 }}>
          {t(l("Yayın durur, alarm", "Publishing stops until"))}
        </text>
        <text x={20} y={134} style={{ ...sans, fontSize: 14 }}>
          {t(l("sönene kadar bekler.", "the alarm clears."))}
        </text>
      </Card>
      <Card x={575} y={246} w={255} h={190} fill="var(--mint-soft)">
        <text x={20} y={40} style={{ ...display, fontSize: 19 }}>
          {t(l("Consumer'lar", "Consumers"))}
        </text>
        <text x={20} y={78} style={{ ...sans, fontSize: 14 }}>
          {t(l("Çalışmaya devam eder:", "Keep working:"))}
        </text>
        <text x={20} y={100} style={{ ...sans, fontSize: 14 }}>
          {t(l("kuyruğu boşaltmak", "draining the queues"))}
        </text>
        <text x={20} y={122} style={{ ...sans, fontSize: 14 }}>
          {t(l("alarmı söndürür.", "is what clears it."))}
        </text>
      </Card>
    </g>
  );
}

/** A checklist to copy into your own project. */
export function ChecklistPanel({ t }: { t: (x: L) => string }) {
  const items: L[] = [
    l("Kuyruk derinliği (ready) için alarm: sürekli artıyorsa", "Alert on queue depth (ready) that keeps growing"),
    l("Consumer sayısı 0 olunca alarm", "Alert when a queue has 0 consumers"),
    l("Unacked uzun süre düşmüyorsa: takılan consumer", "Unacked not dropping for long: a stuck consumer"),
    l("Bellek ve disk alarmları (check_local_alarms)", "Memory and disk alarms (check_local_alarms)"),
    l("Uzun ömürlü bağlantı, iş parçacığı başına kanal", "Long-lived connections, a channel per thread"),
    l("Manual ack + prefetch, durable + persistent", "Manual acks + prefetch, durable + persistent"),
    l("Önemli kuyruklar quorum, zehirli mesaja DLX", "Quorum for important queues, a DLX for poison messages"),
    l("Prometheus (15692) + Grafana panosu", "Prometheus (15692) + a Grafana dashboard"),
  ];
  return (
    <Card x={60} y={30} w={740} h={410} fill="var(--card)">
      <text x={30} y={46} style={{ ...display, fontSize: 24 }}>
        {t(l("Kendi projen için kontrol listesi", "A checklist for your own project"))}
      </text>
      {items.map((it, i) => (
        <g key={i} transform={`translate(30 ${84 + i * 42})`}>
          <rect width={24} height={24} rx={7} style={{ fill: "var(--mint)", stroke: "var(--ink)", strokeWidth: 2 }} />
          <path d="M6 12.5l4 4 8-9" style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }} />
          <text x={40} y={18} style={{ ...sans, fontSize: 16.5, fill: "var(--ink)" }}>
            {t(it)}
          </text>
        </g>
      ))}
    </Card>
  );
}
