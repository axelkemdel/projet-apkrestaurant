import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BellRing,
  Copy,
  ExternalLink,
  ImageDown,
  Loader2,
  Pencil,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { zoneName } from "../../lib/localize";
import { downloadBlob, isLocalOnly, printQrSheet, publicBaseUrl, qrPng, qrSvg, tableUrl } from "../../lib/qr";
import { Modal } from "../Modal";
import { toast } from "../Toasts";
import type { AdminTable, TableStatus } from "../../types";

interface TablesResponse {
  restaurant: { name: string };
  tables: AdminTable[];
}

const statusChip: Record<TableStatus, string> = {
  FREE: "bg-emerald-50 text-emerald-700",
  OCCUPIED: "bg-brand-50 text-brand-700",
  RESERVED: "bg-sky-50 text-sky-700",
};

/**
 * Plan de salle du gérant : tables et QR codes clients. Chaque QR code encode
 * l'adresse /qr/<jeton secret> de sa table ; impression en planche A4 (PDF) ou
 * image PNG, et régénération du jeton si un QR code a été copié ou volé.
 */
export function TablesTab() {
  const { t } = useTranslation();
  const [data, setData] = useState<TablesResponse | null>(null);
  const [editing, setEditing] = useState<AdminTable | "new" | null>(null);

  const load = useCallback(() => {
    api<TablesResponse>("/admin/tables")
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    load();
    // Statut des tables et demandes des clients en direct
    const s = getSocket();
    const events = ["table_updated", "server_alert", "request_bill", "table_alert_cleared"] as const;
    events.forEach((e) => s.on(e, load));
    return () => events.forEach((e) => s.off(e, load));
  }, [load]);

  const base = publicBaseUrl();
  const localOnly = isLocalOnly(base);

  async function printTables(tables: AdminTable[]) {
    if (!data || tables.length === 0) return;
    // Fenêtre ouverte immédiatement (geste utilisateur), remplie après génération des QR codes
    const win = window.open("", "_blank");
    if (!win) return toast.error(t("common.noResponse"));
    await printQrSheet(
      win,
      tables.map((tb) => ({ url: tableUrl(tb.qrToken), title: t("common.table", { number: tb.number, lng: "fr" }), zone: tb.zone })),
      {
        restaurant: data.restaurant.name,
        // Support bilingue, quelle que soit la langue de l'administration
        lineFr: t("tablesAdmin.cardLine", { lng: "fr" }),
        lineEn: t("tablesAdmin.cardLine", { lng: "en" }),
        docTitle: `QR — ${data.restaurant.name}`,
      },
    );
  }

  async function downloadPng(tb: AdminTable) {
    try {
      const blob = await qrPng(tableUrl(tb.qrToken), t("common.table", { number: tb.number, lng: "fr" }), data?.restaurant.name ?? "");
      downloadBlob(blob, `table-${tb.number}-qr.png`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copyLink(tb: AdminTable) {
    try {
      await navigator.clipboard.writeText(tableUrl(tb.qrToken));
      toast.success(t("tablesAdmin.linkCopied"));
    } catch {
      window.prompt(t("tablesAdmin.copyLink"), tableUrl(tb.qrToken));
    }
  }

  async function regenerate(tb: AdminTable) {
    if (!confirm(t("tablesAdmin.regenerateConfirm", { number: tb.number }))) return;
    try {
      await api(`/admin/tables/${tb.id}/regenerate-qr`, { method: "POST" });
      toast.success(t("tablesAdmin.regenerated", { number: tb.number }));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(tb: AdminTable) {
    if (!confirm(t("tablesAdmin.confirmDelete", { number: tb.number }))) return;
    try {
      await api(`/admin/tables/${tb.id}`, { method: "DELETE" });
      toast.success(t("tablesAdmin.deleted", { number: tb.number }));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex-1 space-y-1">
          <p className="flex items-start gap-2 text-sm text-slate-500">
            <QrCode size={16} className="mt-0.5 shrink-0 text-brand-600" />
            {t("tablesAdmin.intro")}
          </p>
          <p className="text-xs text-slate-400">{t("tablesAdmin.printHint")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            onClick={() => setEditing("new")}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Plus size={18} /> {t("tablesAdmin.add")}
          </button>
          <button
            onClick={() => void printTables(data.tables)}
            disabled={data.tables.length === 0}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-40"
          >
            <Printer size={18} /> {t("tablesAdmin.printAll")}
          </button>
        </div>
      </div>

      <div className={`rounded-xl px-4 py-3 text-sm ${localOnly ? "bg-amber-50 text-amber-900" : "bg-white text-slate-600 shadow-sm"}`}>
        <span className="font-semibold">{t("tablesAdmin.publicUrl")} : </span>
        <code className="break-all">{base}/qr/…</code>
        {localOnly && (
          <p className="mt-1 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {t("tablesAdmin.localhostWarning", { url: base })}
          </p>
        )}
      </div>

      {data.tables.length === 0 ? (
        <p className="rounded-2xl bg-white py-16 text-center text-slate-400 shadow-sm">{t("tablesAdmin.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.tables.map((tb) => (
            <TableCard
              key={tb.id}
              table={tb}
              onPrint={() => void printTables([tb])}
              onPng={() => void downloadPng(tb)}
              onCopy={() => void copyLink(tb)}
              onRegenerate={() => void regenerate(tb)}
              onEdit={() => setEditing(tb)}
              onDelete={() => void remove(tb)}
            />
          ))}
        </ul>
      )}

      <TableForm
        editing={editing}
        zones={[...new Set(["Salle", "Terrasse", "VIP", ...data.tables.map((tb) => tb.zone)])]}
        nextNumber={Math.max(0, ...data.tables.map((tb) => tb.number)) + 1}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}

function TableCard({
  table: tb,
  onPrint,
  onPng,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
}: {
  table: AdminTable;
  onPrint: () => void;
  onPng: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const url = tableUrl(tb.qrToken);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    qrSvg(url).then((s) => alive && setSvg(s));
    return () => {
      alive = false;
    };
  }, [url]);

  const svgUrl = useMemo(() => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null), [svg]);

  return (
    <motion.li layout className="flex flex-col rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex gap-4">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white p-1.5">
          {svgUrl ? <img src={svgUrl} alt={t("common.table", { number: tb.number })} className="h-full w-full" /> : <Loader2 className="animate-spin text-slate-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold">{t("common.table", { number: tb.number })}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>{zoneName(tb.zone, t)}</span>
            <span className="flex items-center gap-1">
              <Users size={14} /> {tb.capacity}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
            <span className={`rounded-full px-2 py-0.5 ${statusChip[tb.status]}`}>{t(`tableStatus.${tb.status}`)}</span>
            {tb.callRequestedAt && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                <BellRing size={12} /> {t("alerts.callBadge")}
              </span>
            )}
            {tb.billRequestedAt && (
              <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                <ReceiptText size={12} /> {t("alerts.billBadge")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onPrint} className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-sm font-semibold text-white">
          <Printer size={16} /> {t("tablesAdmin.printOne")}
        </button>
        <button onClick={onPng} className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">
          <ImageDown size={16} /> {t("tablesAdmin.downloadPng")}
        </button>
      </div>
      <div className="mt-2 flex justify-between gap-1 border-t border-slate-100 pt-2">
        <IconButton label={t("tablesAdmin.copyLink")} onClick={onCopy} Icon={Copy} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={t("tablesAdmin.openLink")}
          aria-label={t("tablesAdmin.openLink")}
          className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <ExternalLink size={18} />
        </a>
        <IconButton label={t("tablesAdmin.regenerate")} onClick={onRegenerate} Icon={RefreshCw} />
        <IconButton label={t("tablesAdmin.edit", { number: tb.number })} onClick={onEdit} Icon={Pencil} />
        <IconButton
          label={tb.deletable ? t("common.delete") : t("tablesAdmin.hasHistory")}
          onClick={onDelete}
          Icon={Trash2}
          disabled={!tb.deletable}
          danger
        />
      </div>
    </motion.li>
  );
}

function IconButton({
  label,
  onClick,
  Icon,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  Icon: typeof Copy;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-12 w-12 items-center justify-center rounded-lg text-slate-500 disabled:opacity-30 ${
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100"
      }`}
    >
      <Icon size={18} />
    </button>
  );
}

function TableForm({
  editing,
  zones,
  nextNumber,
  onClose,
  onSaved,
}: {
  editing: AdminTable | "new" | null;
  zones: string[];
  nextNumber: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [number, setNumber] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [zone, setZone] = useState("Salle");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    if (editing === "new") {
      setNumber(String(nextNumber));
      setCapacity("4");
      setZone("Salle");
    } else {
      setNumber(String(editing.number));
      setCapacity(String(editing.capacity));
      setZone(editing.zone);
    }
  }, [editing, nextNumber]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const body = JSON.stringify({ number: Number(number), capacity: Number(capacity), zone: zone.trim() });
      const saved = await api<AdminTable>(editing === "new" ? "/admin/tables" : `/admin/tables/${editing.id}`, {
        method: editing === "new" ? "POST" : "PUT",
        body,
      });
      toast.success(t("tablesAdmin.saved", { number: saved.number }));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const input = "min-h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-brand-500";

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={editing === "new" ? t("tablesAdmin.newTable") : editing ? t("tablesAdmin.edit", { number: editing.number }) : ""}
    >
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">
            {t("tablesAdmin.number")}
            <input type="number" inputMode="numeric" min={1} max={9999} required value={number} onChange={(e) => setNumber(e.target.value)} className={`mt-1 ${input}`} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t("tablesAdmin.capacity")}
            <input type="number" inputMode="numeric" min={1} max={50} required value={capacity} onChange={(e) => setCapacity(e.target.value)} className={`mt-1 ${input}`} />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          {t("tablesAdmin.zone")}
          <input list="table-zones" required maxLength={30} value={zone} onChange={(e) => setZone(e.target.value)} className={`mt-1 ${input}`} />
          <datalist id="table-zones">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>
        <button type="submit" disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {saving && <Loader2 size={18} className="animate-spin" />}
          {t("common.save")}
        </button>
      </form>
    </Modal>
  );
}
