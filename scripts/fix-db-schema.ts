// scripts/fix-db-schema.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Adding "heading" column to "photo_nodes" table...');
    try {
        await prisma.$executeRawUnsafe(`
      ALTER TABLE "photo_nodes" ADD COLUMN IF NOT EXISTS "heading" DOUBLE PRECISION;
    `);
        console.log('✅ Successfully added "heading" column.');
    } catch (error) {
        console.error('❌ Failed to add column:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
