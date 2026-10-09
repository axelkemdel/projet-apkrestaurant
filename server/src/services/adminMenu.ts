import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { deleteDishImage, isLocalDishImage, saveDishImage } from "../lib/uploads.js";
import { audit, diffFields, type Actor } from "../lib/audit.js";
import { normalizeOptions, optionsInputSchema } from "../lib/menuOptions.js";

// ---------------------------------------------------------------------------
// Validation (les champs arrivent en multipart/form-data, donc en texte)
// ---------------------------------------------------------------------------

const jsonField = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    if (v.trim() === "") return undefined;
    try {
      return JSON.parse(v);
    } catch {
      return Symbol("invalid"); // fera échouer la validation
    }
  }, schema);

const boolField = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());

/** URL d'image acceptée : https externe (CDN ; http serait bloqué par la CSP et en clair) ou fichier téléversé ici. */
const imageUrlField = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || isLocalDishImage(u) || /^https:\/\/[^\s"'<>]+$/i.test(u), "validation.imageUrl");

// Carte bilingue : nom obligatoire dans les deux langues, descriptions facultatives
const itemFields = {
  nameFr: z.string({ required_error: "validation.nameRequired" }).trim().min(1, "validation.nameRequired").max(80),
  nameEn: z.string({ required_error: "validation.nameRequired" }).trim().min(1, "validation.nameRequired").max(80),
  descriptionFr: z.string().trim().max(300).optional(),
  descriptionEn: z.string().trim().max(300).optional(),
  price: z.coerce.number().int("validation.priceInteger").min(0).max(10_000_000),
  categoryId: z.string({ required_error: "validation.categoryRequired" }).min(1, "validation.categoryRequired"),
  isAvailable: boolField.optional(),
  isArchived: boolField.optional(),
  options: jsonField(optionsInputSchema.nullable()).optional(),
  imageUrl: imageUrlField.optional(),
  removeImage: boolField.optional(),
};

const createItemSchema = z.object(itemFields).strict();
const updateItemSchema = z.object(itemFields).partial().strict();

function cleanOptions(o: z.infer<typeof optionsInputSchema> | null | undefined) {
  if (!o) return Prisma.DbNull;
  const cleaned = {
    ...(o.cooking?.length && { cooking: o.cooking }),
    ...(o.sides?.length && { sides: o.sides }),
    ...(o.extras?.length && { extras: o.extras }),
  };
  return Object.keys(cleaned).length ? cleaned : Prisma.DbNull;
}

const adminItemInclude = { _count: { select: { orderItems: true } } } satisfies Prisma.MenuItemInclude;

function toAdminItem(item: Prisma.MenuItemGetPayload<{ include: typeof adminItemInclude }>) {
  const { _count, ...rest } = item;
  // Un plat déjà commandé ne peut pas être supprimé (historique des ventes) : seulement masqué
  return { ...rest, options: normalizeOptions(rest.options), timesOrdered: _count.orderItems, deletable: _count.orderItems === 0 };
}

// ---------------------------------------------------------------------------
// Plats
// ---------------------------------------------------------------------------

export async function listAdminMenu() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { items: { orderBy: { nameFr: "asc" }, include: adminItemInclude } },
  });
  return categories.map((c) => ({ ...c, items: c.items.map(toAdminItem) }));
}

async function assertCategory(categoryId: string) {
  if (!(await prisma.category.findUnique({ where: { id: categoryId } }))) {
    throw new HttpError(400, "menu.categoryNotFound");
  }
}

/** Image retenue : fichier téléversé > URL saisie > suppression demandée > inchangée. */
async function resolveImage(file: Express.Multer.File | undefined, imageUrl?: string, removeImage?: boolean) {
  if (file) return { value: await saveDishImage(file), uploaded: true };
  if (imageUrl !== undefined && imageUrl !== "") return { value: imageUrl, uploaded: false };
  if (removeImage || imageUrl === "") return { value: null, uploaded: false };
  return undefined;
}

export async function createMenuItem(raw: unknown, actor: Actor, file?: Express.Multer.File) {
  const input = createItemSchema.parse(raw);
  await assertCategory(input.categoryId);
  const image = await resolveImage(file, input.imageUrl, input.removeImage);
  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
      data: {
        nameFr: input.nameFr,
        nameEn: input.nameEn,
        descriptionFr: input.descriptionFr || null,
        descriptionEn: input.descriptionEn || null,
        price: input.price,
        categoryId: input.categoryId,
        isAvailable: input.isAvailable ?? true,
        isArchived: input.isArchived ?? false,
        options: cleanOptions(input.options),
        imageUrl: image?.value ?? null,
      },
      include: adminItemInclude,
      });
      await audit(tx, actor, "MENU_ITEM_CREATED", {
        menuItemId: created.id,
        nameFr: created.nameFr,
        nameEn: created.nameEn,
        price: created.price,
      });
      return created;
    });
    return toAdminItem(item);
  } catch (e) {
    if (image?.uploaded) await deleteDishImage(image.value);
    throw e;
  }
}

export async function updateMenuItem(id: string, raw: unknown, actor: Actor, file?: Express.Multer.File) {
  const input = updateItemSchema.parse(raw);
  const current = await prisma.menuItem.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, "menu.itemNotFound");
  if (input.categoryId) await assertCategory(input.categoryId);

  const image = await resolveImage(file, input.imageUrl, input.removeImage);
  try {
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({
      where: { id },
      data: {
        nameFr: input.nameFr,
        nameEn: input.nameEn,
        descriptionFr: input.descriptionFr === undefined ? undefined : input.descriptionFr || null,
        descriptionEn: input.descriptionEn === undefined ? undefined : input.descriptionEn || null,
        price: input.price,
        categoryId: input.categoryId,
        isAvailable: input.isAvailable,
        isArchived: input.isArchived,
        options: input.options === undefined ? undefined : cleanOptions(input.options),
        ...(image && { imageUrl: image.value }),
      },
      include: adminItemInclude,
      });
      // Autres changements (disponibilité, archivage, catégorie, options et leurs suppléments…) : ancien → nouveau
      const changes = diffFields(current, updated, ["nameFr", "nameEn", "categoryId", "isAvailable", "isArchived", "options", "imageUrl", "descriptionFr", "descriptionEn"]);
      if (Object.keys(changes).length) {
        await audit(tx, actor, "MENU_ITEM_UPDATED", { menuItemId: id, nameFr: updated.nameFr, nameEn: updated.nameEn, changes });
      }
      // Anti-fraude : tout changement de prix est tracé (ancien → nouveau)
      if (input.price !== undefined && input.price !== current.price) {
        await audit(tx, actor, "MENU_PRICE_CHANGED", {
          menuItemId: id,
          nameFr: updated.nameFr,
          nameEn: updated.nameEn,
          oldPrice: current.price,
          newPrice: input.price,
        });
      }
      return updated;
    });
    // L'ancienne image téléversée n'est plus référencée : on libère le disque
    if (image && current.imageUrl !== image.value) await deleteDishImage(current.imageUrl);
    return toAdminItem(item);
  } catch (e) {
    if (image?.uploaded) await deleteDishImage(image.value);
    throw e;
  }
}

export async function setAvailability(id: string, raw: unknown, actor: Actor) {
  const { isAvailable } = z.object({ isAvailable: z.boolean().optional() }).strict().parse(raw ?? {});
  const current = await prisma.menuItem.findUnique({ where: { id }, select: { isAvailable: true } });
  if (!current) throw new HttpError(404, "menu.itemNotFound");
  // Sans valeur explicite : bascule. Avec valeur : idempotent (deux gérants qui cliquent ne s'annulent pas).
  const next = isAvailable ?? !current.isAvailable;
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.menuItem.update({ where: { id }, data: { isAvailable: next }, include: adminItemInclude });
    if (next !== current.isAvailable) {
      await audit(tx, actor, "MENU_ITEM_UPDATED", {
        menuItemId: id,
        nameFr: updated.nameFr,
        nameEn: updated.nameEn,
        changes: { isAvailable: { from: current.isAvailable, to: next } },
      });
    }
    return updated;
  });
  return toAdminItem(item);
}

export async function deleteMenuItem(id: string, actor: Actor) {
  const item = await prisma.menuItem.findUnique({ where: { id }, include: adminItemInclude });
  if (!item) throw new HttpError(404, "menu.itemNotFound");
  if (item._count.orderItems > 0) {
    throw new HttpError(409, "menu.cannotDeleteOrdered");
  }
  await prisma.$transaction([
    prisma.menuItem.delete({ where: { id } }),
    prisma.auditLog.create({
      data: { userId: actor.id, ipAddress: actor.ip, action: "MENU_ITEM_DELETED", details: { menuItemId: id, nameFr: item.nameFr, nameEn: item.nameEn, price: item.price } },
    }),
  ]);
  await deleteDishImage(item.imageUrl);
  return item;
}

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  nameFr: z.string({ required_error: "validation.nameRequired" }).trim().min(1, "validation.nameRequired").max(40),
  nameEn: z.string({ required_error: "validation.nameRequired" }).trim().min(1, "validation.nameRequired").max(40),
  station: z.enum(["KITCHEN", "BAR"]),
  order: z.number().int().min(0).max(999).optional(),
}).strict();

function uniqueNameError(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
    ? new HttpError(409, "menu.categoryExists")
    : e;
}

export async function createCategory(raw: unknown, actor: Actor) {
  const input = categorySchema.parse(raw);
  const last = await prisma.category.aggregate({ _max: { order: true } });
  return prisma
    .$transaction(async (tx) => {
      const created = await tx.category.create({ data: { ...input, order: input.order ?? (last._max.order ?? -1) + 1 } });
      await audit(tx, actor, "MENU_CATEGORY_CHANGED", { op: "created", categoryId: created.id, nameFr: created.nameFr, nameEn: created.nameEn, station: created.station });
      return created;
    })
    .catch((e) => Promise.reject(uniqueNameError(e)));
}

export async function updateCategory(id: string, raw: unknown, actor: Actor) {
  const input = categorySchema.partial().parse(raw);
  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, "menu.categoryNotFound");
  return prisma
    .$transaction(async (tx) => {
      const updated = await tx.category.update({ where: { id }, data: input });
      const changes = diffFields(current, updated, ["nameFr", "nameEn", "station", "order"]);
      if (Object.keys(changes).length) {
        await audit(tx, actor, "MENU_CATEGORY_CHANGED", { op: "updated", categoryId: id, nameFr: updated.nameFr, nameEn: updated.nameEn, changes });
      }
      return updated;
    })
    .catch((e) => Promise.reject(uniqueNameError(e)));
}

export async function deleteCategory(id: string, actor: Actor) {
  const category = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
  if (!category) throw new HttpError(404, "menu.categoryNotFound");
  if (category._count.items > 0) throw new HttpError(409, "menu.categoryNotEmpty");
  await prisma.$transaction(async (tx) => {
    await tx.category.delete({ where: { id } });
    await audit(tx, actor, "MENU_CATEGORY_CHANGED", { op: "deleted", categoryId: id, nameFr: category.nameFr, nameEn: category.nameEn, station: category.station });
  });
}
