import "dotenv/config";

/** Informations légales imprimées en en-tête des tickets de caisse. */
export const restaurantInfo = {
  name: process.env.RESTAURANT_NAME ?? "RestoApp",
  address: process.env.RESTAURANT_ADDRESS ?? "",
  phone: process.env.RESTAURANT_PHONE ?? "",
  nif: process.env.RESTAURANT_NIF ?? "",
  rccm: process.env.RESTAURANT_RCCM ?? "",
  footer: process.env.RECEIPT_FOOTER ?? "Merci de votre visite !",
  footerEn: process.env.RECEIPT_FOOTER_EN ?? "Thank you for your visit!",
  currency: process.env.CURRENCY_LABEL ?? "FCFA",
};
