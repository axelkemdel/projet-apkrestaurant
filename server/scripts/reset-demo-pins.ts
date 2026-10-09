/**
 * Maintenance avant mise en service : remplace les codes PIN faibles ou de démonstration
 * (0000, 1111, 1234…) par des PIN aléatoires à 6 chiffres, uniques et hachés par bcrypt.
 *
 *   npm run pins:reset -w server                  # comptes au PIN faible uniquement
 *   npm run pins:reset -w server -- --all         # tous les comptes actifs
 *   npm run pins:reset -w server -- --dry-run     # liste les comptes concernés, sans rien modifier
 *
 * Base de production (Railway) : lancer depuis un poste de confiance avec l'URL PUBLIQUE de
 * la base (onglet Variables du service PostgreSQL → DATABASE_PUBLIC_URL) :
 *
 *   DATABASE_URL="postgresql://…" NODE_ENV=production npm run pins:reset -w server -- --confirm
 *
 * Pour chaque compte modifié : nouveau hachage bcrypt (coût 12), sessions ouvertes fermées
 * (version de session incrémentée), action PIN_RESET au journal d'audit (sans le PIN).
 * Les PIN en clair n'existent qu'une fois : à l'écran et dans un récapitulatif lisible
 * par vous seul (droits 600), hors du dépôt. Transmettez-les puis supprimez ce fichier.
 */
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, type Role } from "@prisma/client";
import "dotenv/config";

/** Même coût que src/services/authService.ts (BCRYPT_COST). */
const BCRYPT_COST = 12;
const ROLES: Role[] = ["ADMIN", "SERVEUR", "CUISINE", "CAISSE"];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const resetAll = flag("all");
const dryRun = flag("dry-run");
const noFile = flag("no-file");

/** Chiffres identiques, suite croissante ou décroissante (0123, 9876, 345678…). */
function isTrivial(pin: string): boolean {
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  return steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

/** PIN testés contre chaque hachage : démonstration, motifs et codes les plus utilisés. */
const WEAK_PINS = [
  ...Array.from({ length: 10 }, (_, i) => String(i).repeat(4)),
  ...Array.from({ length: 10 }, (_, i) => String(i).repeat(6)),
  "1234", "4321", "0123", "1212", "2580", "1122", "6969", "1004", "2000", "2468", "1357", "5555",
  "12345", "123456", "654321", "012345", "123123", "121212", "112233", "111222", "159753", "147258", "123321", "000001",
];

function generatePin(taken: Set<string>): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!taken.has(pin) && !isTrivial(pin) && !WEAK_PINS.includes(pin)) return pin;
  }
}

async function weakPinOf(hash: string): Promise<string | null> {
  for (const pin of WEAK_PINS) if (await bcrypt.compare(pin, hash)) return pin;
  return null;
}

async function main() {
  if (process.env.NODE_ENV === "production" && !dryRun && !flag("confirm")) {
    throw new Error("Base de production : relancez avec --confirm (ou --dry-run pour simuler).");
  }
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ROLES }, isActive: true },
      select: { id: true, name: true, username: true, role: true, pinHash: true },
      orderBy: [{ role: "asc" }, { username: "asc" }],
    });
    if (!users.length) return void console.log("Aucun compte actif.");

    console.log(`${users.length} compte(s) actif(s) : ${resetAll ? "tous seront réinitialisés" : "recherche des PIN faibles (quelques secondes par compte)…"}`);
    const targets: (typeof users[number] & { reason: string })[] = [];
    for (const u of users) {
      const weak = resetAll ? null : await weakPinOf(u.pinHash);
      if (resetAll || weak) targets.push({ ...u, reason: resetAll ? "--all" : "PIN faible" });
      console.log(`  ${resetAll || weak ? "⚠" : "✔"} ${u.username.padEnd(20)} ${u.role.padEnd(8)} ${resetAll ? "à réinitialiser" : weak ? "PIN faible" : "PIN non trivial"}`);
    }
    if (!targets.length) return void console.log("✔ Aucun PIN faible détecté : rien à faire.");
    if (dryRun) return void console.log(`\n(simulation) ${targets.length} compte(s) seraient réinitialisés.`);

    const taken = new Set<string>();
    const summary: { name: string; username: string; role: Role; pin: string }[] = [];
    for (const u of targets) {
      const pin = generatePin(taken);
      taken.add(pin);
      const pinHash = await bcrypt.hash(pin, BCRYPT_COST);
      await prisma.$transaction(async (tx) => {
        // Nouveau PIN + jetons existants invalidés : chaque employé doit se reconnecter
        await tx.user.update({ where: { id: u.id }, data: { pinHash, sessionVersion: { increment: 1 } } });
        await tx.authSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "pin_reset" } });
        await tx.auditLog.create({
          data: { userId: null, action: "PIN_RESET", ipAddress: null, details: { targetUserId: u.id, name: u.name, generated: true, source: "maintenance_script", reason: u.reason } },
        });
      });
      summary.push({ name: u.name, username: u.username, role: u.role, pin });
    }

    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const lines = [
      `THAONI APP — nouveaux codes PIN (${new Date().toLocaleString("fr-FR")})`,
      "Confidentiel : remettez chaque code à son titulaire en main propre, puis supprimez ce fichier.",
      "",
      ...summary.map((s) => `${s.role.padEnd(8)} ${s.username.padEnd(20)} ${s.pin}   ${s.name}`),
      "",
    ];
    console.log(`\n${lines.join("\n")}`);
    if (!noFile) {
      // Hors du dépôt Git par défaut, lisible par l'utilisateur courant seulement
      const file = resolve(option("out") ?? join(homedir(), `thaoni-pins-${stamp}.txt`));
      writeFileSync(file, lines.join("\n"), { mode: 0o600, flag: "wx" });
      console.log(`Récapitulatif (droits 600) : ${file}\nAprès distribution : shred -u "${file}"`);
    }
    console.log(`✔ ${summary.length} PIN réinitialisé(s), sessions fermées, action tracée au journal d'audit.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`✘ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
