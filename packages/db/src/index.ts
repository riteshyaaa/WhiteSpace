import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";


const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForThis = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForThis.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV === "development") {
  globalForThis.prisma = prisma;
}
