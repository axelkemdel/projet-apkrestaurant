-- Journal d'audit : modifications de la carte (hors prix, déjà tracés), des catégories et du plan de salle
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MENU_ITEM_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MENU_CATEGORY_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TABLE_CHANGED';
