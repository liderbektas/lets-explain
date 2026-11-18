import { useLang, type L } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import type { CalloutKind } from "@lets-explain/core/course/types";
import { Icon } from "@lets-explain/core/components/Icon";
import { Rich } from "@lets-explain/core/components/Rich";

const icons: Record<CalloutKind, string> = { insight: "bulb", reality: "eye", analogy: "spark", warning: "alert" };

export function Callout({ kind, text }: { kind: CalloutKind; text: L }) {
  const { t } = useLang();
  return (
    <aside className={`callout callout-${kind}`}>
      <span className="callout-icon">
        <Icon name={icons[kind]} size={18} />
      </span>
      <div>
        <span className="callout-label">{t(ui.callouts[kind])}</span>
        <p>
          <Rich text={t(text)} />
        </p>
      </div>
    </aside>
  );
}
