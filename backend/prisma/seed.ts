import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Rail car makes and models
const carMakes = ['Trinity', 'Greenbrier', 'FreightCar', 'NSC', 'Gunderson', 'ARI'];
const carModels = ['Hopper', 'Tank', 'Gondola', 'Boxcar', 'Flatcar', 'Covered Hopper'];
const carStatuses = ['available', 'in_service', 'scheduled', 'retired'];

// Shop locations
const shopData = [
  { name: 'Houston Rail Center', code: 'HOU', location: 'Houston, TX' },
  { name: 'Chicago Yards', code: 'CHI', location: 'Chicago, IL' },
  { name: 'Los Angeles Terminal', code: 'LAX', location: 'Los Angeles, CA' },
  { name: 'Atlanta Service Hub', code: 'ATL', location: 'Atlanta, GA' },
  { name: 'Dallas Maintenance', code: 'DFW', location: 'Dallas, TX' },
  { name: 'Seattle Pacific', code: 'SEA', location: 'Seattle, WA' },
  { name: 'Denver Mountain', code: 'DEN', location: 'Denver, CO' },
  { name: 'Kansas City Central', code: 'KCI', location: 'Kansas City, MO' },
  { name: 'New Orleans Gulf', code: 'MSY', location: 'New Orleans, LA' },
  { name: 'Phoenix Desert', code: 'PHX', location: 'Phoenix, AZ' },
  { name: 'Memphis River', code: 'MEM', location: 'Memphis, TN' },
  { name: 'St. Louis Gateway', code: 'STL', location: 'St. Louis, MO' },
  { name: 'Minneapolis North', code: 'MSP', location: 'Minneapolis, MN' },
  { name: 'Portland Pacific', code: 'PDX', location: 'Portland, OR' },
  { name: 'San Antonio Express', code: 'SAT', location: 'San Antonio, TX' },
  { name: 'Cleveland Lake', code: 'CLE', location: 'Cleveland, OH' },
  { name: 'Detroit Motor', code: 'DTW', location: 'Detroit, MI' },
  { name: 'Birmingham Steel', code: 'BHM', location: 'Birmingham, AL' },
  { name: 'Jacksonville Port', code: 'JAX', location: 'Jacksonville, FL' },
  { name: 'Salt Lake Mountain', code: 'SLC', location: 'Salt Lake City, UT' },
  { name: 'Omaha Plains', code: 'OMA', location: 'Omaha, NE' },
];

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  await prisma.scenarioModification.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.planAssignment.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.car.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  console.log('✓ Cleared existing data');

  // Create company
  const company = await prisma.company.create({
    data: {
      id: uuidv4(),
      name: 'AITX Rail Services',
      code: 'AITX',
    },
  });

  console.log('✓ Created company:', company.name);

  // Create users
  const adminPassword = await bcrypt.hash('password123', 10);
  const userPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'admin@aitx.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      companyId: company.id,
    },
  });

  const planner = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'planner@aitx.com',
      password: userPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'planner',
      companyId: company.id,
    },
  });

  const viewer = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'viewer@aitx.com',
      password: userPassword,
      firstName: 'Mike',
      lastName: 'Williams',
      role: 'viewer',
      companyId: company.id,
    },
  });

  console.log('✓ Created users: admin, planner, viewer');

  // Create 21 shops
  const shops = await Promise.all(
    shopData.map(async (shop, index) => {
      return prisma.shop.create({
        data: {
          id: uuidv4(),
          name: shop.name,
          code: shop.code,
          location: shop.location,
          capacity: 8 + Math.floor(Math.random() * 8), // 8-15 cars/month
          costMultiplier: 0.85 + Math.random() * 0.4, // 0.85-1.25
          turnTimeMultiplier: 0.9 + Math.random() * 0.3, // 0.9-1.2
          isActive: index < 18, // 18 active, 3 inactive
          companyId: company.id,
        },
      });
    })
  );

  console.log(`✓ Created ${shops.length} shops`);

  // Create 200 cars
  const cars = await Promise.all(
    Array.from({ length: 200 }, (_, i) => {
      const make = carMakes[Math.floor(Math.random() * carMakes.length)];
      const model = carModels[Math.floor(Math.random() * carModels.length)];
      const year = 2010 + Math.floor(Math.random() * 15);
      const statusWeights = [0.6, 0.15, 0.2, 0.05]; // available, in_service, scheduled, retired
      const rand = Math.random();
      let statusIndex = 0;
      let cumulative = 0;
      for (let j = 0; j < statusWeights.length; j++) {
        cumulative += statusWeights[j];
        if (rand < cumulative) {
          statusIndex = j;
          break;
        }
      }

      return prisma.car.create({
        data: {
          id: uuidv4(),
          vehicleNumber: `AITX${String(100000 + i).slice(1)}`,
          make,
          model,
          year,
          mileage: Math.floor(Math.random() * 500000) + 50000,
          status: carStatuses[statusIndex],
          lastServiceDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
          nextServiceDue: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000),
          companyId: company.id,
        },
      });
    })
  );

  console.log(`✓ Created ${cars.length} cars`);

  // Create 2 plans
  const plan2024 = await prisma.plan.create({
    data: {
      id: uuidv4(),
      name: '2024 Service Plan',
      description: 'Annual service schedule for 2024 fleet maintenance',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      status: 'active',
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  const plan2025 = await prisma.plan.create({
    data: {
      id: uuidv4(),
      name: '2025 Service Plan',
      description: 'Projected service schedule for 2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      status: 'draft',
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  console.log('✓ Created 2 plans');

  // Create assignments for 2024 plan
  const activeShops = shops.filter((s) => s.isActive);
  const months2024 = [
    '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06',
    '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12'
  ];
  const months2025 = [
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
    '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'
  ];

  // Distribute cars across shops and months for 2024
  let assignmentCount = 0;
  const usedCarMonths2024 = new Set<string>();

  for (const month of months2024) {
    for (const shop of activeShops) {
      const carsForShop = Math.floor(Math.random() * shop.capacity * 0.8) + 2;
      for (let i = 0; i < carsForShop; i++) {
        const car = cars[Math.floor(Math.random() * cars.length)];
        const key = `${car.id}-${month}`;

        if (!usedCarMonths2024.has(key)) {
          usedCarMonths2024.add(key);
          await prisma.planAssignment.create({
            data: {
              id: uuidv4(),
              planId: plan2024.id,
              carId: car.id,
              shopId: shop.id,
              scheduledMonth: month,
              estimatedCost: 15000 + Math.floor(Math.random() * 20000),
              estimatedDuration: 10 + Math.floor(Math.random() * 10),
              status: month < '2024-11' ? 'completed' : month === '2024-11' ? 'in_progress' : 'pending',
            },
          });
          assignmentCount++;
        }
      }
    }
  }

  console.log(`✓ Created ${assignmentCount} assignments for 2024 plan`);

  // Create fewer assignments for 2025 draft plan
  assignmentCount = 0;
  const usedCarMonths2025 = new Set<string>();

  for (const month of months2025.slice(0, 6)) {
    for (const shop of activeShops.slice(0, 10)) {
      const carsForShop = Math.floor(Math.random() * shop.capacity * 0.5) + 1;
      for (let i = 0; i < carsForShop; i++) {
        const car = cars[Math.floor(Math.random() * cars.length)];
        const key = `${car.id}-${month}`;

        if (!usedCarMonths2025.has(key)) {
          usedCarMonths2025.add(key);
          await prisma.planAssignment.create({
            data: {
              id: uuidv4(),
              planId: plan2025.id,
              carId: car.id,
              shopId: shop.id,
              scheduledMonth: month,
              estimatedCost: 15000 + Math.floor(Math.random() * 20000),
              estimatedDuration: 10 + Math.floor(Math.random() * 10),
              status: 'pending',
            },
          });
          assignmentCount++;
        }
      }
    }
  }

  console.log(`✓ Created ${assignmentCount} assignments for 2025 plan`);

  // Create a sample scenario
  const scenario = await prisma.scenario.create({
    data: {
      id: uuidv4(),
      name: 'High Volume Q2 2025',
      description: 'What-if analysis for increased service volume in Q2 2025',
      basePlanId: plan2025.id,
      status: 'completed',
      results: JSON.stringify({
        totalCost: 2850000,
        costDelta: 5.2,
        averageTurnTime: 14.3,
        turnTimeDelta: -2.1,
        shopUtilization: {
          'Houston Rail Center': 85,
          'Chicago Yards': 78,
          'Los Angeles Terminal': 92,
          'Atlanta Service Hub': 65,
          'Dallas Maintenance': 88,
        },
        monthlyDistribution: {
          '2025-01': 45,
          '2025-02': 52,
          '2025-03': 48,
          '2025-04': 65,
          '2025-05': 72,
          '2025-06': 58,
        },
      }),
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  console.log('✓ Created sample scenario');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\nLogin credentials:');
  console.log('  Admin: admin@aitx.com / password123');
  console.log('  Planner: planner@aitx.com / password123');
  console.log('  Viewer: viewer@aitx.com / password123');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
