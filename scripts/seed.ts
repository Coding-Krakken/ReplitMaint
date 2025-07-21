import { DatabaseStorage } from '../server/dbStorage';

(async () => {
  try {
    const storage = new DatabaseStorage();
    await storage.initializeData();
    console.log('Database seeded successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
})();
