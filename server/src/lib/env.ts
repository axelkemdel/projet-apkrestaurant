import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET"),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((o) => o.trim()),
};
