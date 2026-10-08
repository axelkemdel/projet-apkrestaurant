import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, Hourglass, Loader2, ReceiptText as Receipt, UtensilsCrossed } from "lucide-react";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { formatPrice, paymentModeLabel } from "../../lib/format";
import { toast } from "../Toasts";
import type { DailyStats, PaymentMode, Station, TopItems } from "../../types";

// Palette catégorielle validée (ordre fixe, jamais recyclé) — voir README « Graphiques »
const MODE_ORDER: PaymentMode[] = ["CASH", "ORANGE_MONEY", "CARD", "TELECEL_CASH"];
const MODE_COLOR: Record<PaymentMode, string> = {
  CASH: "#2a78d6",
  ORANGE_MONEY: "#eb6834",
  CARD: "#1baf7a",
  TELECEL_CASH: "#eda100",
};
const SERIES = "#2a78d6";
const GRID = "#e2e8f0";
const AXIS = "#64748b";

const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fr-FR");

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function StatsTab() {
  const [date, setDate] = useState(isoDate());
  const [daily, setDaily] = useState<DailyStats | null>(null);
  const [top, setTop] = useState<TopItems | null>(null);
  const [period, setPeriod] = useState<TopItems["period"]>("day");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        api<DailyStats>(`/admin/stats/daily?date=${date}`),
        api<TopItems>(`/admin/stats/top-items?date=${date}&period=${period}`),
      ]);
      setDaily(d);
      setTop(t);
      setUpdatedAt(new Date());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [date, period]);

  useEffect(() => {
    void load();
  }, [load]);

  // Temps réel : encaissements et nouveaux bons rafraîchissent les indicateurs (regroupés)
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void loadRef.current(), 1500);
    };
    const s = getSocket();
    const events = ["payment_recorded", "new_order", "order_updated"] as const;
    events.forEach((e) => s.on(e, refresh));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => s.off(e, refresh));
    };
  }, []);

  if (!daily || !top) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  const isToday = date === isoDate();

  return (
    <div className="space-y-4">
      {/* Filtres : une seule rangée au-dessus des graphiques */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-white p-1 shadow-sm">
          {[
            [isoDate(), "Aujourd'hui"],
            [isoDate(-1), "Hier"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setDate(value)}
              className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${date === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-3 text-sm shadow-sm">
          <CalendarDays size={16} className="text-slate-400" />
          <input
            type="date"
            value={date}
            max={isoDate()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="bg-transparent outline-none"
            aria-label="Choisir une date"
          />
        </label>
        <div className="flex-1" />
        {updatedAt && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            {isToday && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
            {isToday ? "En direct · " : ""}mis à jour à {updatedAt.toLocaleTimeString("fr-FR")}
          </span>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Banknote}
          label={isToday ? "Chiffre d'affaires du jour" : "Chiffre d'affaires"}
          value={formatPrice(daily.revenue.today)}
          delta={daily.revenue.changePct}
          deltaHint={
            daily.revenue.comparison === "same_time_yesterday"
              ? `vs hier à la même heure (${formatPrice(daily.revenue.comparedTo)})`
              : `vs veille (${formatPrice(daily.revenue.comparedTo)})`
          }
          footer={`${daily.revenue.payments} encaissement${daily.revenue.payments > 1 ? "s" : ""}${
            daily.discounts.count ? ` · ${formatPrice(daily.discounts.amount)} de remises (${daily.discounts.count})` : ""
          }`}
        />
        <Kpi
          icon={UtensilsCrossed}
          label="Commandes servies"
          value={integer.format(daily.orders.served)}
          footer={`${daily.orders.created} bon${daily.orders.created > 1 ? "s" : ""} créé${daily.orders.created > 1 ? "s" : ""}${
            daily.orders.cancelled ? ` · ${daily.orders.cancelled} annulé${daily.orders.cancelled > 1 ? "s" : ""}` : ""
          }`}
        />
        <Kpi
          icon={Receipt}
          label="Panier moyen par addition"
          value={formatPrice(daily.bills.averageAmount)}
          footer={`${daily.bills.settled} addition${daily.bills.settled > 1 ? "s" : ""} soldée${daily.bills.settled > 1 ? "s" : ""} · ${daily.bills.dineIn} sur place, ${daily.bills.takeaway} à emporter`}
        />
        <Kpi
          icon={Hourglass}
          label="Encours non encaissé"
          value={formatPrice(daily.outstanding)}
          footer="Additions ouvertes en ce moment"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card title="Encaissements par mode de paiement" className="xl:col-span-2">
          <PaymentModes stats={daily} />
        </Card>
        <Card title="Plats & boissons stars" className="xl:col-span-3">
          <TopItemsList top={top} period={period} onPeriod={setPeriod} />
        </Card>
      </div>

      <Card title="Heures de pointe" subtitle={peakSubtitle(daily)}>
        <div className="grid gap-6 lg:grid-cols-2">
          <HourlyChart data={daily.hourly} dataKey="revenue" title="Chiffre d'affaires encaissé par heure" format={formatPrice} />
          <HourlyChart data={daily.hourly} dataKey="orders" title="Bons envoyés en cuisine par heure" format={(v) => `${v} bon${v > 1 ? "s" : ""}`} />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Kpi({
  icon: Icon,
  label,
  value,
  footer,
  delta,
  deltaHint,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  footer?: string;
  delta?: number | null;
  deltaHint?: string;
}) {
  return (
    <motion.div layout className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <Icon size={16} /> {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums tracking-tight text-slate-900 sm:text-3xl">{value}</div>
      {delta !== undefined && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {delta === null ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500">—</span>
          ) : (
            <span
              className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
                delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {delta >= 0 ? "+" : ""}
              {delta.toLocaleString("fr-FR")} %
            </span>
          )}
          {deltaHint && <span className="text-slate-500">{deltaHint}</span>}
        </div>
      )}
      {footer && <div className="mt-2 text-xs text-slate-500">{footer}</div>}
    </motion.div>
  );
}

function Card({ title, subtitle, className = "", children }: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// --- Ventilation des paiements : barre empilée + légende chiffrée ------------

function PaymentModes({ stats }: { stats: DailyStats }) {
  const rows = MODE_ORDER.map((mode) => stats.paymentsByMode.find((m) => m.mode === mode) ?? { mode, amount: 0, count: 0 });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total === 0) return <p className="py-8 text-center text-sm text-slate-400">Aucun encaissement sur cette journée</p>;

  return (
    <div className="space-y-4">
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-md" role="img" aria-label="Répartition des encaissements par mode">
        {rows
          .filter((r) => r.amount > 0)
          .map((r) => (
            <motion.div
              key={r.mode}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: r.amount }}
              transition={{ duration: 0.5 }}
              style={{ backgroundColor: MODE_COLOR[r.mode], flexBasis: 0 }}
              title={`${paymentModeLabel[r.mode]} : ${formatPrice(r.amount)}`}
            />
          ))}
      </div>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Mode</th>
            <th>Montant</th>
            <th>Part</th>
            <th>Encaissements</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.mode}>
              <td className="py-2">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: MODE_COLOR[r.mode] }} />
                  {paymentModeLabel[r.mode]}
                </span>
              </td>
              <td className="py-2 text-right font-semibold tabular-nums text-slate-900">{formatPrice(r.amount)}</td>
              <td className="w-14 py-2 text-right tabular-nums text-slate-500">{Math.round((r.amount / total) * 100)} %</td>
              <td className="w-16 py-2 text-right tabular-nums text-slate-400">× {r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Top 5 --------------------------------------------------------------------

function TopItemsList({
  top,
  period,
  onPeriod,
}: {
  top: TopItems;
  period: TopItems["period"];
  onPeriod: (p: TopItems["period"]) => void;
}) {
  const [metric, setMetric] = useState<"quantity" | "revenue">("quantity");
  const [station, setStation] = useState<Station | "ALL">("ALL");

  const list = useMemo(
    () =>
      (metric === "quantity" ? top.byQuantity : top.byRevenue).filter((i) => station === "ALL" || i.station === station).slice(0, 5),
    [top, metric, station],
  );
  const max = Math.max(1, ...list.map((i) => i[metric]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Segmented
          value={metric}
          onChange={setMetric}
          options={[
            ["quantity", "Volume"],
            ["revenue", "Valeur"],
          ]}
        />
        <Segmented
          value={station}
          onChange={setStation}
          options={[
            ["ALL", "Tout"],
            ["KITCHEN", "Plats"],
            ["BAR", "Boissons"],
          ]}
        />
        <Segmented
          value={period}
          onChange={onPeriod}
          options={[
            ["day", "Jour"],
            ["week", "7 jours"],
            ["month", "30 jours"],
          ]}
        />
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Aucune vente sur la période</p>
      ) : (
        <ol className="space-y-2.5">
          {list.map((item, idx) => (
            <li key={item.menuItemId} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 gap-y-1">
              <span className="text-sm font-bold text-slate-400">{idx + 1}</span>
              <span className="truncate text-sm font-medium text-slate-800">{item.name}</span>
              <span className="text-right text-sm font-semibold tabular-nums text-slate-900">
                {metric === "quantity" ? `${integer.format(item.quantity)} vendu${item.quantity > 1 ? "s" : ""}` : formatPrice(item.revenue)}
              </span>
              <span />
              <div className="col-span-2 h-2 rounded-full bg-slate-100">
                <motion.div
                  className="h-2 rounded-full"
                  style={{ backgroundColor: SERIES }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(item[metric] / max) * 100}%` }}
                  transition={{ duration: 0.4, delay: idx * 0.04 }}
                  title={`${item.quantity} vendus · ${formatPrice(item.revenue)} · ${item.orders} bons`}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex flex-1 rounded-lg bg-slate-100 p-0.5 text-xs font-semibold sm:flex-none">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`min-h-10 flex-1 whitespace-nowrap rounded-md px-2.5 sm:min-h-8 ${value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// --- Heures de pointe : deux histogrammes (jamais de double axe) ---------------

function peakSubtitle(d: DailyStats) {
  const peak = d.hourly.reduce((best, h) => (h.orders > best.orders ? h : best), d.hourly[0]);
  if (!peak || peak.orders === 0) return "Aucune activité sur cette journée";
  return `Pic d'affluence : ${peak.hour} h – ${peak.hour + 1} h (${peak.orders} bons, ${peak.items} articles)`;
}

function HourlyChart({
  data,
  dataKey,
  title,
  format,
}: {
  data: DailyStats["hourly"];
  dataKey: "revenue" | "orders";
  title: string;
  format: (v: number) => string;
}) {
  // Plage affichée : heures d'ouverture habituelles, élargie si de l'activité tombe en dehors
  const active = data.filter((h) => h.revenue > 0 || h.orders > 0).map((h) => h.hour);
  const from = Math.min(8, ...active);
  const to = Math.max(22, ...active);
  const rows = data.filter((h) => h.hour >= from && h.hour <= to).map((h) => ({ ...h, label: `${h.hour}h` }));

  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium text-slate-600">{title}</figcaption>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickFormatter={(v: number) => compact.format(v)}
            />
            <Tooltip cursor={{ fill: "#f1f5f9" }} content={({ active, payload }) => <ChartTooltip active={active} payload={payload} format={format} />} />
            <Bar dataKey={dataKey} fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function ChartTooltip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown; payload?: unknown }[];
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as DailyStats["hourly"][number];
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="font-semibold">
        {row.hour} h – {row.hour + 1} h
      </div>
      <div>{format(Number(payload[0].value))}</div>
    </div>
  );
}
