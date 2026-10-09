import type { Request } from "express";

/**
 * Messages renvoyés par l'API, en français et en anglais. Le code (clé) est
 * stable et renvoyé avec le message (`{ error, code }`) : un client peut s'y
 * fier ; le texte suit la langue de l'écran (en-tête Accept-Language, ou langue
 * déclarée par l'appareil sur Socket.io).
 */
export type Lang = "fr" | "en";

const fr = {
  // Session & accès
  "auth.required": "Authentification requise",
  "auth.expired": "Session expirée, reconnectez-vous",
  "auth.idleExpired": "Session expirée après inactivité",
  "auth.forbiddenRole": "Accès refusé pour ce rôle",
  // Message unique pour tout échec de connexion : ne révèle jamais si l'identifiant existe
  "auth.invalidCredentials": "Identifiants invalides",
  "auth.tooManyAttempts": "Trop de tentatives : réessayez dans 5 minutes",
  // HTTP générique
  "http.originNotAllowed": "Origine non autorisée",
  "http.invalidId": "Identifiant invalide",
  "http.invalidData": "Données invalides",
  "http.internal": "Erreur interne du serveur",
  "http.notFound": "Route introuvable",
  "http.resourceNotFound": "Élément introuvable",
  "http.conflict": "Opération impossible : élément utilisé ailleurs",
  "http.payloadTooLarge": "Requête trop volumineuse",
  "http.tooManyRequests": "Trop de requêtes, réessayez dans un instant",
  // Téléversement
  "upload.badFormat": "Format d'image non supporté (JPEG, PNG ou WebP uniquement)",
  "upload.tooLarge": "Image trop lourde (3 Mo maximum)",
  "upload.rejected": "Fichier refusé",
  // Commandes
  "table.notFound": "Table introuvable",
  "order.notFound": "Commande introuvable",
  "order.itemNotFound": "Article introuvable dans la carte",
  "order.itemUnavailable": "« {{name}} » n'est plus disponible",
  "order.invalidCooking": "Cuisson invalide pour « {{name}} »",
  "order.invalidSide": "Accompagnement invalide pour « {{name}} »",
  "order.invalidExtra": "Supplément « {{extra}} » invalide pour « {{name}} »",
  "order.transition": "Transition impossible : {{from}} → {{to}}",
  "order.concurrentChange": "La commande a été modifiée entre-temps",
  "order.cannotCancelSettled": "Un versement ou une remise porte déjà sur ce bon : annulation impossible",
  "order.roleCannotSend": "Rôle non autorisé à envoyer des commandes",
  "order.actionForbidden": "Action non autorisée pour ce rôle",
  // Caisse
  "checkout.itemNotInBill": "Article absent de cette addition",
  "checkout.nothingToPay": "Rien à encaisser : l'addition est peut-être déjà soldée",
  "checkout.alreadySettled": "Cette addition est déjà soldée",
  "checkout.qtyExceeds": "« {{name}} » : quantité supérieure au reste à payer",
  "checkout.amountExceeds": "Montant supérieur au solde restant ({{remaining}} {{currency}})",
  "checkout.cashInsufficient": "Montant remis insuffisant",
  "checkout.tableOrder": "Ce bon appartient à une table : encaissez l'addition de la table",
  "checkout.paymentNotFound": "Paiement introuvable",
  "checkout.noOpenBill": "Aucune addition ouverte à remiser",
  "checkout.discountZero": "Remise nulle",
  "checkout.discountExceeds": "La remise dépasse le solde restant ({{remaining}} {{currency}})",
  "checkout.discountCap": "Remise cumulée de {{pct}} % : au-delà de {{max}} %, l'accord d'un gérant est requis",
  // Carte
  "menu.itemNotFound": "Plat introuvable",
  "menu.categoryNotFound": "Catégorie introuvable",
  "menu.cannotDeleteOrdered": "Ce plat figure dans des commandes passées : masquez-le plutôt que de le supprimer",
  "menu.categoryExists": "Une catégorie porte déjà ce nom",
  "menu.categoryNotEmpty": "Déplacez ou supprimez d'abord les plats de cette catégorie",
  // Personnel
  "users.notFound": "Employé introuvable",
  "users.cannotRemoveOwnAdmin": "Vous ne pouvez pas retirer votre propre accès gérant",
  "users.lastAdmin": "Il doit rester au moins un gérant actif",
  "users.usernameTaken": "Cet identifiant est déjà utilisé",
  // Validation (messages Zod personnalisés)
  "validation.emptyOrder": "La commande est vide",
  "validation.tableRequired": "Une table est requise pour une commande sur place",
  "validation.nameRequired": "Nom requis",
  "validation.priceInteger": "Prix entier en FCFA",
  "validation.categoryRequired": "Catégorie requise",
  "validation.imageUrl": "URL d'image invalide (https uniquement)",
  "validation.amountTooLarge": "Montant trop élevé",
  "validation.duplicates": "Valeurs en double",
  "validation.dateFormat": "Date attendue au format AAAA-MM-JJ",
  "validation.dateInvalid": "Date invalide",
  "validation.pinFormat": "Le code PIN doit comporter 4 à 6 chiffres",
  "validation.usernameFormat": "Identifiant : 3 à 32 caractères (lettres minuscules, chiffres, . _ -)",
  "validation.tableOrOrder": "Indiquez soit une table, soit un bon à emporter",
  "validation.amountOrItems": "Montant ou articles requis",
  "validation.reasonRequired": "Motif obligatoire (3 caractères minimum)",
  "validation.percentRange": "Pourcentage entre 1 et 100",
  "validation.invalidId": "Identifiant invalide",
  "stats.invalidPeriod": "Période invalide",
  // Tables & portail client (QR code)
  "table.numberTaken": "La table n° {{number}} existe déjà",
  "table.hasHistory": "Cette table a un historique de commandes : elle ne peut pas être supprimée",
  "portal.invalidQr": "QR code invalide ou expiré : demandez de l'aide au personnel",
  "portal.orderingDisabled": "La commande en ligne est désactivée : appelez un serveur",
  "portal.noOpenBill": "Aucune commande en cours pour cette table",
  "portal.nothingToReview": "Passez commande avant de laisser un avis",
  "portal.alreadyReviewed": "Merci, votre avis a déjà été enregistré",
  "portal.orderNotFound": "Commande introuvable pour cette table",
  "portal.tooManyOrders": "Trop de commandes envoyées : patientez quelques minutes ou appelez un serveur",
  "portal.tooManyRequests": "Demande déjà envoyée, patientez un instant",
} as const;

export type MessageKey = keyof typeof fr;

const en: Record<MessageKey, string> = {
  "auth.required": "Authentication required",
  "auth.expired": "Session expired, please sign in again",
  "auth.idleExpired": "Session expired due to inactivity",
  "auth.forbiddenRole": "Access denied for this role",
  "auth.invalidCredentials": "Invalid credentials",
  "auth.tooManyAttempts": "Too many attempts: please try again in 5 minutes",
  "http.originNotAllowed": "Origin not allowed",
  "http.invalidId": "Invalid identifier",
  "http.invalidData": "Invalid data",
  "http.internal": "Internal server error",
  "http.notFound": "Route not found",
  "http.resourceNotFound": "Item not found",
  "http.conflict": "Operation not possible: item in use elsewhere",
  "http.payloadTooLarge": "Request too large",
  "http.tooManyRequests": "Too many requests, please try again shortly",
  "upload.badFormat": "Unsupported image format (JPEG, PNG or WebP only)",
  "upload.tooLarge": "Image too large (3 MB maximum)",
  "upload.rejected": "File rejected",
  "table.notFound": "Table not found",
  "order.notFound": "Order not found",
  "order.itemNotFound": "Item not found on the menu",
  "order.itemUnavailable": "“{{name}}” is no longer available",
  "order.invalidCooking": "Invalid cooking option for “{{name}}”",
  "order.invalidSide": "Invalid side dish for “{{name}}”",
  "order.invalidExtra": "Invalid extra “{{extra}}” for “{{name}}”",
  "order.transition": "Invalid transition: {{from}} → {{to}}",
  "order.concurrentChange": "The order was modified in the meantime",
  "order.cannotCancelSettled": "A payment or discount already applies to this ticket: it cannot be cancelled",
  "order.roleCannotSend": "This role is not allowed to send orders",
  "order.actionForbidden": "Action not allowed for this role",
  "checkout.itemNotInBill": "Item is not on this bill",
  "checkout.nothingToPay": "Nothing to collect: the bill may already be settled",
  "checkout.alreadySettled": "This bill is already settled",
  "checkout.qtyExceeds": "“{{name}}”: quantity exceeds what is left to pay",
  "checkout.amountExceeds": "Amount exceeds the remaining balance ({{remaining}} {{currency}})",
  "checkout.cashInsufficient": "Cash received is insufficient",
  "checkout.tableOrder": "This ticket belongs to a table: settle the table's bill",
  "checkout.paymentNotFound": "Payment not found",
  "checkout.noOpenBill": "No open bill to discount",
  "checkout.discountZero": "Discount is zero",
  "checkout.discountExceeds": "Discount exceeds the remaining balance ({{remaining}} {{currency}})",
  "checkout.discountCap": "Cumulative discount of {{pct}}%: above {{max}}%, a manager's approval is required",
  "menu.itemNotFound": "Dish not found",
  "menu.categoryNotFound": "Category not found",
  "menu.cannotDeleteOrdered": "This dish appears in past orders: hide it instead of deleting it",
  "menu.categoryExists": "A category with this name already exists",
  "menu.categoryNotEmpty": "Move or delete this category's dishes first",
  "users.notFound": "Staff member not found",
  "users.cannotRemoveOwnAdmin": "You cannot remove your own manager access",
  "users.lastAdmin": "At least one active manager must remain",
  "users.usernameTaken": "This username is already taken",
  "validation.emptyOrder": "The order is empty",
  "validation.tableRequired": "A table is required for a dine-in order",
  "validation.nameRequired": "Name required",
  "validation.priceInteger": "Price must be a whole number of FCFA",
  "validation.categoryRequired": "Category required",
  "validation.imageUrl": "Invalid image URL (https only)",
  "validation.amountTooLarge": "Amount too large",
  "validation.duplicates": "Duplicate values",
  "validation.dateFormat": "Date expected as YYYY-MM-DD",
  "validation.dateInvalid": "Invalid date",
  "validation.pinFormat": "PIN code must have 4 to 6 digits",
  "validation.usernameFormat": "Username: 3 to 32 characters (lowercase letters, digits, . _ -)",
  "validation.tableOrOrder": "Specify either a table or a takeaway ticket",
  "validation.amountOrItems": "Amount or items required",
  "validation.reasonRequired": "Reason required (at least 3 characters)",
  "validation.percentRange": "Percentage between 1 and 100",
  "validation.invalidId": "Invalid identifier",
  "stats.invalidPeriod": "Invalid period",
  "table.numberTaken": "Table no. {{number}} already exists",
  "table.hasHistory": "This table has an order history: it cannot be deleted",
  "portal.invalidQr": "Invalid or expired QR code: please ask the staff for help",
  "portal.orderingDisabled": "Online ordering is disabled: please call a waiter",
  "portal.noOpenBill": "No order in progress for this table",
  "portal.nothingToReview": "Please order before leaving a review",
  "portal.alreadyReviewed": "Thank you, your review has already been recorded",
  "portal.orderNotFound": "Order not found for this table",
  "portal.tooManyOrders": "Too many orders sent: please wait a few minutes or call a waiter",
  "portal.tooManyRequests": "Request already sent, please wait a moment",
};

const dictionaries: Record<Lang, Record<MessageKey, string>> = { fr, en };

export type MessageParams = Record<string, string | number>;

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(fr, value);
}

/**
 * Traduit un code. Un paramètre peut être fourni dans les deux langues
 * (`name_fr` / `name_en`, ex. nom d'un plat) : la variante de la langue demandée est utilisée.
 */
export function translate(lang: Lang, key: MessageKey, params: MessageParams = {}): string {
  return dictionaries[lang][key].replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(params[`${name}_${lang}`] ?? params[name] ?? ""),
  );
}

/** Langue de la requête : en-tête Accept-Language envoyé par l'écran (défaut : français). */
export function langOf(req: Pick<Request, "acceptsLanguages">): Lang {
  return req.acceptsLanguages("fr", "en") === "en" ? "en" : "fr";
}

export function parseLang(value: unknown): Lang {
  return value === "en" ? "en" : "fr";
}
