#!/usr/bin/env ts-node

/**
 * CSV Import Script for Employees and Vehicles
 *
 * Usage:
 *   npm run import-csv -- --employees path/to/employees.csv
 *   npm run import-csv -- --vehicles path/to/vehicles.csv
 *   npm run import-csv -- --employees employees.csv --vehicles vehicles.csv
 *
 * Employee CSV Format:
 *   email, password, firstName, lastName, role, employeeNumber, department, position, skills(comma-separated), maxHoursPerWeek
 *
 * Vehicle CSV Format:
 *   plateNumber, type, model, year, fuelType, fuelCapacity, assignedOperatorEmail(optional)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole, VehicleType, FuelType } from '@prisma/client';

const prisma = new PrismaClient();

interface EmployeeRow {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  employeeNumber: string;
  department: string;
  position: string;
  skills?: string;
  maxHoursPerWeek?: string;
}

interface VehicleRow {
  plateNumber: string;
  type: string;
  model: string;
  year: string;
  fuelType: string;
  fuelCapacity: string;
  assignedOperatorEmail?: string;
}

async function importEmployees(filePath: string): Promise<void> {
  console.log(`\n📥 Importing employees from: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const employees: EmployeeRow[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row: EmployeeRow) => employees.push(row))
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });

  console.log(`Found ${employees.length} employees to import\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const emp of employees) {
    try {
      // Validate required fields
      if (!emp.email || !emp.password || !emp.firstName || !emp.lastName ||
          !emp.role || !emp.employeeNumber || !emp.department || !emp.position) {
        console.error(`❌ Skipping row - missing required fields:`, emp);
        skipped++;
        continue;
      }

      // Validate role
      if (!Object.values(UserRole).includes(emp.role as UserRole)) {
        console.error(`❌ Invalid role "${emp.role}" for ${emp.email}. Must be one of: ${Object.values(UserRole).join(', ')}`);
        skipped++;
        continue;
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: emp.email.toLowerCase() },
      });

      if (existingUser) {
        console.log(`⚠️  User ${emp.email} already exists, skipping`);
        skipped++;
        continue;
      }

      // Check if employee number already exists
      const existingEmp = await prisma.employee.findUnique({
        where: { employeeNumber: emp.employeeNumber },
      });

      if (existingEmp) {
        console.log(`⚠️  Employee number ${emp.employeeNumber} already exists, skipping`);
        skipped++;
        continue;
      }

      // Parse skills
      const skills = emp.skills ? emp.skills.split(',').map(s => s.trim()) : [];
      const maxHoursPerWeek = emp.maxHoursPerWeek ? parseInt(emp.maxHoursPerWeek) : 40;

      // Hash password
      const hashedPassword = await bcrypt.hash(emp.password, 12);

      // Create user and employee
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: emp.email.toLowerCase(),
            password: hashedPassword,
            firstName: emp.firstName,
            lastName: emp.lastName,
            role: emp.role as UserRole,
            isActive: true,
          },
        });

        await tx.employee.create({
          data: {
            userId: user.id,
            employeeNumber: emp.employeeNumber,
            department: emp.department,
            position: emp.position,
            skills,
            maxHoursPerWeek,
            availability: {},
            isActive: true,
          },
        });
      });

      console.log(`✅ Imported employee: ${emp.firstName} ${emp.lastName} (${emp.email})`);
      imported++;

    } catch (error) {
      console.error(`❌ Error importing employee ${emp.email}:`, error);
      errors++;
    }
  }

  console.log(`\n📊 Employee Import Summary:`);
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⚠️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
}

async function importVehicles(filePath: string): Promise<void> {
  console.log(`\n🚗 Importing vehicles from: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const vehicles: VehicleRow[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row: VehicleRow) => vehicles.push(row))
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });

  console.log(`Found ${vehicles.length} vehicles to import\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const veh of vehicles) {
    try {
      // Validate required fields
      if (!veh.plateNumber || !veh.type || !veh.model || !veh.year ||
          !veh.fuelType || !veh.fuelCapacity) {
        console.error(`❌ Skipping row - missing required fields:`, veh);
        skipped++;
        continue;
      }

      // Validate vehicle type
      if (!Object.values(VehicleType).includes(veh.type as VehicleType)) {
        console.error(`❌ Invalid type "${veh.type}" for ${veh.plateNumber}. Must be one of: ${Object.values(VehicleType).join(', ')}`);
        skipped++;
        continue;
      }

      // Validate fuel type
      if (!Object.values(FuelType).includes(veh.fuelType as FuelType)) {
        console.error(`❌ Invalid fuel type "${veh.fuelType}" for ${veh.plateNumber}. Must be one of: ${Object.values(FuelType).join(', ')}`);
        skipped++;
        continue;
      }

      // Check if vehicle already exists
      const existingVehicle = await prisma.vehicle.findUnique({
        where: { plateNumber: veh.plateNumber.toUpperCase() },
      });

      if (existingVehicle) {
        console.log(`⚠️  Vehicle ${veh.plateNumber} already exists, skipping`);
        skipped++;
        continue;
      }

      // Find assigned operator if specified
      let assignedOperatorId: string | null = null;
      if (veh.assignedOperatorEmail) {
        const operator = await prisma.user.findUnique({
          where: { email: veh.assignedOperatorEmail.toLowerCase() },
          include: { employee: true },
        });

        if (operator && operator.employee) {
          assignedOperatorId = operator.employee.id;
        } else {
          console.log(`⚠️  Operator ${veh.assignedOperatorEmail} not found for vehicle ${veh.plateNumber}, creating unassigned`);
        }
      }

      // Create vehicle
      await prisma.vehicle.create({
        data: {
          plateNumber: veh.plateNumber.toUpperCase(),
          type: veh.type as VehicleType,
          model: veh.model,
          year: parseInt(veh.year),
          fuelType: veh.fuelType as FuelType,
          fuelCapacity: parseFloat(veh.fuelCapacity),
          assignedOperatorId,
          isActive: true,
        },
      });

      console.log(`✅ Imported vehicle: ${veh.plateNumber} (${veh.model})`);
      imported++;

    } catch (error) {
      console.error(`❌ Error importing vehicle ${veh.plateNumber}:`, error);
      errors++;
    }
  }

  console.log(`\n📊 Vehicle Import Summary:`);
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⚠️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
}

async function main() {
  const args = process.argv.slice(2);

  let employeesFile: string | null = null;
  let vehiclesFile: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--employees' && args[i + 1]) {
      employeesFile = args[i + 1];
      i++;
    } else if (args[i] === '--vehicles' && args[i + 1]) {
      vehiclesFile = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
CSV Import Script for Employees and Vehicles

Usage:
  npm run import-csv -- --employees path/to/employees.csv
  npm run import-csv -- --vehicles path/to/vehicles.csv
  npm run import-csv -- --employees employees.csv --vehicles vehicles.csv

Employee CSV Format:
  email,password,firstName,lastName,role,employeeNumber,department,position,skills,maxHoursPerWeek

  Example:
  email,password,firstName,lastName,role,employeeNumber,department,position,skills,maxHoursPerWeek
  john@example.com,password123,John,Doe,OPERATOR,EMP001,Sanitation,Driver,"driving,machinery",40

Vehicle CSV Format:
  plateNumber,type,model,year,fuelType,fuelCapacity,assignedOperatorEmail

  Example:
  plateNumber,type,model,year,fuelType,fuelCapacity,assignedOperatorEmail
  34ABC123,TRUCK,Mercedes Actros,2020,DIESEL,300,john@example.com

Available Roles:
  ${Object.values(UserRole).join(', ')}

Available Vehicle Types:
  ${Object.values(VehicleType).join(', ')}

Available Fuel Types:
  ${Object.values(FuelType).join(', ')}
      `);
      process.exit(0);
    }
  }

  if (!employeesFile && !vehiclesFile) {
    console.error('❌ Error: Please specify --employees and/or --vehicles file path');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  try {
    console.log('🚀 Starting CSV import...\n');

    if (employeesFile) {
      await importEmployees(employeesFile);
    }

    if (vehiclesFile) {
      await importVehicles(vehiclesFile);
    }

    console.log('\n✨ Import completed successfully!');
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
