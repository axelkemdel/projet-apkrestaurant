import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { deleteDishImage, isLocalDishImage, saveDishImage } from "../lib/uploads.js";

// ---------------------------------------------------------------------------
// Validation (les champs arrivent en multipart/form-data, donc en texte)
// ---------------------------------------------------------------------------

const label = z.string().trim().min(1).max(40);
const uniqueLabels = z
  .array(label)
  .max(12)
  .refine((a) => new Set(a.map((v) => v.toLowerCase())).size === a.length, "Valeurs en double");

const optionsSchema = z
  .object({
    cooking: uniqueLabels.optional(),
    sides: uniqueLabels.optional(),
    extras: z
      .array(z.object({ name: label, price: z.number().int().min(0).max(1_000_000) }))
      .max(15)
      .refine((a) => new Set(a.map((e) => e.name.toLowerCase())).size === a.length, "Suppléments en double")
      .optional(),
  })
  .strict();

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

/** URL d'image acceptée : http(s) externe (CDN) ou fichier déjà téléversé ici. */
const imageUrlField = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || isLocalDishImage(u) || /^https?:\/\/[^\s"'<>]+$/i.test(u), "URL d'image invalide (http/https)");

const itemFields = {
  name: z.string().trim().min(1, "Nom requis").max(80),
  description: z.string().trim().max(300).optional(),
  price: z.coerce.number().int("Prix entier en FCFA").min(0).max(10_000_000),
  categoryId: z.string().min(1, "Catégorie requise"),
  isAvailable: boolField.optional(),
  isArchived: boolField.optional(),
  options: jsonField(optionsSchema.nullable()).optional(),
  imageUrl: imageUrlField.optional(),
  removeImage: boolField.optional(),
};

const createItemSchema = z.object(itemFields);
const updateItemSchema = z.object(itemFields).partial();

function cleanOptions(o: z.infer<typeof optionsSchema> | null | undefined) {
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
  return { ...rest, timesOrdered: _count.orderItems, deletable: _count.orderItems === 0 };
}

// ---------------------------------------------------------------------------
// Plats
// ---------------------------------------------------------------------------

export async function listAdminMenu() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { items: { orderBy: { name: "asc" }, include: adminItemInclude } },
  });
  return categories.map((c) => ({ ...c, items: c.items.map(toAdminItem) }));
}

async function assertCategory(categoryId: string) {
  if (!(await prisma.category.findUnique({ where: { id: categoryId } }))) {
    throw new HttpError(400, "Catégorie introuvable");
  }
}

/** Image retenue : fichier téléversé > URL saisie > suppression demandée > inchangée. */
async function resolveImage(file: Express.Multer.File | undefined, imageUrl?: string, removeImage?: boolean) {
  if (file) return { value: await saveDishImage(file), uploaded: true };
  if (imageUrl !== undefined && imageUrl !== "") return { value: imageUrl, uploaded: false };
  if (removeImage || imageUrl === "") return { value: null, uploaded: false };
  return undefined;
}

export async function createMenuItem(raw: unknown, file?: Express.Multer.File) {
  const input = createItemSchema.parse(raw);
  await assertCategory(input.categoryId);
  const image = await resolveImage(file, input.imageUrl, input.removeImage);
  try {
    const item = await prisma.menuItem.create({
      data: {
        name: input.name,
        description: input.description || null,
        price: input.price,
        categoryId: input.categoryId,
        isAvailable: input.isAvailable ?? true,
        isArchived: input.isArchived ?? false,
        options: cleanOptions(input.options),
        imageUrl: image?.value ?? null,
      },
      include: adminItemInclude,
    });
    return toAdminItem(item);
  } catch (e) {
    if (image?.uploaded) await deleteDishImage(image.value);
    throw e;
  }
}

export async function updateMenuItem(id: string, raw: unknown, file?: Express.Multer.File) {
  const input = updateItemSchema.parse(raw);
  const current = await prisma.menuItem.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, "Plat introuvable");
  if (input.categoryId) await assertCategory(input.categoryId);

  const image = await resolveImage(file, input.imageUrl, input.removeImage);
  try {
    const item = await prisma.menuItem.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description === undefined ? undefined : input.description || null,
        price: input.price,
        categoryId: input.categoryId,
        isAvailable: input.isAvailable,
        isArchived: input.isArchived,
        options: input.options === undefined ? undefined : cleanOptions(input.options),
        ...(image && { imageUrl: image.value }),
      },
      include: adminItemInclude,
    });
    // L'ancienne image téléversée n'est plus référencée : on libère le disque
    if (image && current.imageUrl !== image.value) await deleteDishImage(current.imageUrl);
    return toAdminItem(item);
  } catch (e) {
    if (image?.uploaded) await deleteDishImage(image.value);
    throw e;
  }
}

export async function setAvailability(id: string, raw: unknown) {
  const { isAvailable } = z.object({ isAvailable: z.boolean().optional() }).parse(raw ?? {});
  const current = await prisma.menuItem.findUnique({ where: { id }, select: { isAvailable: true } });
  if (!current) throw new HttpError(404, "Plat introuvable");
  // Sans valeur explicite : bascule. Avec valeur : idempotent (deux gérants qui cliquent ne s'annulent pas).
  const item = await prisma.menuItem.update({
    where: { id },
    data: { isAvailable: isAvailable ?? !current.isAvailable },
    include: adminItemInclude,
  });
  return toAdminItem(item);
}

export async function deleteMenuItem(id: string) {
  const item = await prisma.menuItem.findUnique({ where: { id }, include: adminItemInclude });
  if (!item) throw new HttpError(404, "Plat introuvable");
  if (item._count.orderItems > 0) {
    throw new HttpError(409, "Ce plat figure dans des commandes passées : masquez-le plutôt que de le supprimer");
  }
  await prisma.menuItem.delete({ where: { id } });
  await deleteDishImage(item.imageUrl);
  return item;
}

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  station: z.enum(["KITCHEN", "BAR"]),
  order: z.number().int().min(0).max(999).optional(),
});

function uniqueNameError(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
    ? new HttpError(409, "Une catégorie porte déjà ce nom")
    : e;
}

export async function createCategory(raw: unknown) {
  const input = categorySchema.parse(raw);
  const last = await prisma.category.aggregate({ _max: { order: true } });
  return prisma.category
    .create({ data: { ...input, order: input.order ?? (last._max.order ?? -1) + 1 } })
    .catch((e) => Promise.reject(uniqueNameError(e)));
}

export async function updateCategory(id: string, raw: unknown) {
  const input = categorySchema.partial().parse(raw);
  if (!(await prisma.category.findUnique({ where: { id } }))) throw new HttpError(404, "Catégorie introuvable");
  return prisma.category.update({ where: { id }, data: input }).catch((e) => Promise.reject(uniqueNameError(e)));
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
  if (!category) throw new HttpError(404, "Catégorie introuvable");
  if (category._count.items > 0) throw new HttpError(409, "Déplacez ou supprimez d'abord les plats de cette catégorie");
  await prisma.category.delete({ where: { id } });
}
