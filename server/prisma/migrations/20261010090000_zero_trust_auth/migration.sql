-- Connexion « Zero-Trust » : identifiant de connexion, sessions à jeton de rafraîchissement, audit des connexions

-- Nouvelles actions du journal d'audit
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_SUCCESS';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'LOGOUT';
ALTER TYPE "AuditAction" ADD VALUE 'SESSION_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCESS_DENIED';

-- Identifiant de connexion : dérivé du nom pour les comptes existants (minuscules,
-- lettres et chiffres, 3 caractères minimum, suffixe numérique en cas de doublon).
-- Le gérant peut ensuite le modifier dans « Personnel & PIN ».
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "username" TEXT;
WITH base AS (
  SELECT id, COALESCE(NULLIF(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')), ''), 'user') AS raw, "createdAt"
  FROM "User"
), padded AS (
  -- rpad tronquerait les noms plus longs : complété seulement s'il est trop court
  SELECT id, CASE WHEN length(raw) < 3 THEN rpad(raw, 3, '0') ELSE left(raw, 28) END AS b, "createdAt" FROM base
), numbered AS (
  SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY "createdAt", id) AS rn FROM padded
)
UPDATE "User" u
SET "username" = n.b || CASE WHEN n.rn > 1 THEN n.rn::text ELSE '' END
FROM numbered n
WHERE u.id = n.id;
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- Sessions (jeton de rafraîchissement : empreinte SHA-256 uniquement)
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
