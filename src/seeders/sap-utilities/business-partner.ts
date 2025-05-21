/**
 * SAP Utilities Business Partner Seeder
 * 
 * Generates realistic business partner data similar to what would be found
 * in an SAP Utilities system. Business partners can be of different types:
 * - Person (individual customers)
 * - Organization (companies, government organizations)
 * - Group (households, joint accounts)
 */

import { faker } from '@faker-js/faker';
import { saveAnchor, attachToAnchor } from '../../core/storage';

// Constants for Business Partner properties
const BUSINESS_PARTNER_CATEGORIES = ['1', '2', '3']; // 1=Person, 2=Organization, 3=Group
const BUSINESS_PARTNER_ROLES = [
  'FLCU00', // Utility Customer
  'FLSU00', // Utility Supplier
  'FLBP00', // Business Partner
  'FLCN00', // Contact
  'FLSP00', // Service Provider
  'FLIV00', // Invoice Recipient
];

const INDUSTRY_SECTORS = [
  'Z001', // Residential
  'Z002', // Commercial
  'Z003', // Industrial
  'Z004', // Municipal
  'Z005', // Agricultural
];

const CUSTOMER_CLASSIFICATIONS = [
  'A', // Premium
  'B', // Standard
  'C', // Basic
];

const REGIONS = [
  'WEST', 
  'EAST', 
  'NORTH', 
  'SOUTH', 
  'CENTRAL'
];

const UTILITY_TYPES = [
  'ELEC', // Electricity
  'GAS',  // Natural Gas
  'WATER', // Water
  'SEWER', // Sewerage
  'STRM',  // Storm water
  'WASTE', // Waste management
];

const METER_TYPES = {
  'ELEC': ['E1', 'E2', 'ESM', 'ETF'],
  'GAS': ['G1', 'G2', 'GSM'],
  'WATER': ['W1', 'W2', 'WSM'],
};

// Types for our business partner data
type AddressType = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  region: string;
  addressType: 'BILL' | 'INST' | 'MAIL'; // Billing, Installation, Mailing
  validFrom: string;
  validTo?: string;
};

type ContactInfoType = {
  type: 'PHONE' | 'MOBILE' | 'EMAIL' | 'FAX';
  value: string;
  isPrimary: boolean;
  validFrom: string;
  validTo?: string;
};

type ContractType = {
  contractId: string;
  utilityType: string;
  startDate: string;
  endDate?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  tariffType: string;
  meterReadingFrequency: 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  billingFrequency: 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'ANNUALLY';
};

type MeterInstallationType = {
  meterId: string;
  serialNumber: string;
  meterType: string;
  installationDate: string;
  removalDate?: string;
  status: 'ACTIVE' | 'INACTIVE';
  registerCount: number;
  isSmartMeter: boolean;
  readingCycle: string;
  lastReadingDate?: string;
  lastReadingValue?: number;
};

type BankAccountType = {
  bankId: string;
  accountNumber: string;
  accountHolder: string;
  iban?: string;
  bic?: string;
  validFrom: string;
  validTo?: string;
  isDefault: boolean;
};

type CreditRatingType = {
  score: number;
  agency: string;
  evaluationDate: string;
  nextEvaluationDate: string;
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH';
};

// Generate a SAP-style business partner ID (10 digits)
function generateBusinessPartnerId(): string {
  return 'BP' + faker.string.numeric(8);
}

// Generate a random date in the past (1-5 years)
function generatePastDate(yearsBack = 5): string {
  return faker.date.past({ years: yearsBack }).toISOString().split('T')[0];
}

// Generate a random date in the future (1-2 years)
function generateFutureDate(): string {
  return faker.date.future({ years: 2 }).toISOString().split('T')[0];
}

// Generate an address based on the address type
function generateAddress(addressType: 'BILL' | 'INST' | 'MAIL'): AddressType {
  return {
    street: faker.location.street(),
    houseNumber: faker.number.int({ min: 1, max: 999 }).toString(),
    postalCode: faker.location.zipCode(),
    city: faker.location.city(),
    country: faker.location.countryCode(),
    region: faker.helpers.arrayElement(REGIONS),
    addressType: addressType,
    validFrom: generatePastDate()
  };
}

// Generate contact information
function generateContactInfo(count: number): ContactInfoType[] {
  const contacts: ContactInfoType[] = [];
  
  // Always generate an email
  contacts.push({
    type: 'EMAIL',
    value: faker.internet.email(),
    isPrimary: true,
    validFrom: generatePastDate(1)
  });
  
  // Add phone number
  contacts.push({
    type: 'PHONE',
    value: faker.phone.number(),
    isPrimary: true,
    validFrom: generatePastDate(1)
  });
  
  // Add mobile if needed
  if (count > 2) {
    contacts.push({
      type: 'MOBILE',
      value: faker.phone.number(),
      isPrimary: false,
      validFrom: generatePastDate(1)
    });
  }
  
  // Add fax if needed
  if (count > 3) {
    contacts.push({
      type: 'FAX',
      value: faker.phone.number(),
      isPrimary: false,
      validFrom: generatePastDate(1)
    });
  }
  
  return contacts;
}

// Generate contracts for a business partner
function generateContracts(count: number): ContractType[] {
  const contracts: ContractType[] = [];
  
  for (let i = 0; i < count; i++) {
    const utilityType = faker.helpers.arrayElement(UTILITY_TYPES);
    const startDate = generatePastDate(3);
    
    contracts.push({
      contractId: 'CT' + faker.string.numeric(8),
      utilityType: utilityType,
      startDate: startDate,
      status: faker.helpers.arrayElement(['ACTIVE', 'INACTIVE', 'PENDING']),
      tariffType: `${utilityType}_${faker.string.alpha(3).toUpperCase()}`,
      meterReadingFrequency: faker.helpers.arrayElement(['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'ANNUALLY']),
      billingFrequency: faker.helpers.arrayElement(['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'ANNUALLY'])
    });
  }
  
  return contracts;
}

// Generate meter installations for a contract
function generateMeterInstallations(contractsData: ContractType[]): MeterInstallationType[] {
  const installations: MeterInstallationType[] = [];
  
  contractsData.forEach(contract => {
    if (contract.status !== 'ACTIVE') return;
    
    // Get meter types for this utility
    const utilityType = contract.utilityType as keyof typeof METER_TYPES;
    if (!METER_TYPES[utilityType]) return;
    
    const meterTypes = METER_TYPES[utilityType];
    const isSmartMeter = faker.datatype.boolean();
    
    installations.push({
      meterId: 'MT' + faker.string.numeric(8),
      serialNumber: faker.string.alphanumeric(10).toUpperCase(),
      meterType: faker.helpers.arrayElement(meterTypes),
      installationDate: contract.startDate,
      status: 'ACTIVE',
      registerCount: faker.number.int({ min: 1, max: 4 }),
      isSmartMeter: isSmartMeter,
      readingCycle: faker.helpers.arrayElement(['01', '02', '03', '04', '05', '06']),
      lastReadingDate: generatePastDate(0.5),
      lastReadingValue: faker.number.int({ min: 100, max: 10000 })
    });
  });
  
  return installations;
}

// Generate bank accounts
function generateBankAccounts(count: number): BankAccountType[] {
  const accounts: BankAccountType[] = [];
  
  for (let i = 0; i < count; i++) {
    accounts.push({
      bankId: faker.string.alphanumeric(8).toUpperCase(),
      accountNumber: faker.finance.accountNumber(),
      accountHolder: faker.person.fullName(),
      iban: faker.finance.iban(),
      bic: faker.finance.bic(),
      validFrom: generatePastDate(),
      isDefault: i === 0 // First account is default
    });
  }
  
  return accounts;
}

// Generate credit rating
function generateCreditRating(): CreditRatingType {
  return {
    score: faker.number.int({ min: 300, max: 850 }),
    agency: faker.helpers.arrayElement(['Experian', 'Equifax', 'TransUnion']),
    evaluationDate: generatePastDate(1),
    nextEvaluationDate: generateFutureDate(),
    riskCategory: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH'])
  };
}

// Generate business partner data based on category
export function generateBusinessPartner(category?: string) {
  // If no category specified, pick a random one
  const partnerCategory = category || faker.helpers.arrayElement(BUSINESS_PARTNER_CATEGORIES);
  const businessPartnerId = generateBusinessPartnerId();
  
  // Base business partner data
  const baseData = {
    id: businessPartnerId,
    businessPartnerNumber: businessPartnerId,
    category: partnerCategory,
    roles: [faker.helpers.arrayElement(BUSINESS_PARTNER_ROLES)],
    industrySector: faker.helpers.arrayElement(INDUSTRY_SECTORS),
    customerClassification: faker.helpers.arrayElement(CUSTOMER_CLASSIFICATIONS),
    createdAt: generatePastDate(),
    lastModified: generatePastDate(0.5)
  };
  
  let specificData = {};
  
  // Add category-specific fields
  if (partnerCategory === '1') {
    // Person
    specificData = {
      ...specificData,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      middleName: faker.datatype.boolean() ? faker.person.middleName() : undefined,
      title: faker.datatype.boolean() ? faker.person.prefix() : undefined,
      gender: faker.person.gender(),
      birthDate: faker.date.birthdate().toISOString().split('T')[0],
      nationality: faker.location.countryCode(),
      maritalStatus: faker.helpers.arrayElement(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']),
    };
  } else if (partnerCategory === '2') {
    // Organization
    specificData = {
      ...specificData,
      organizationName: faker.company.name(),
      organizationType: faker.helpers.arrayElement(['CORP', 'LLC', 'GOVT', 'NGO', 'SOLE']),
      industryKey: faker.helpers.arrayElement(['UTIL', 'MANU', 'RETAIL', 'TECH', 'FIN']),
      foundationDate: generatePastDate(20),
      legalForm: faker.helpers.arrayElement(['INC', 'LLC', 'LTD', 'GMBH', 'AG']),
      vatNumber: faker.string.alphanumeric(10).toUpperCase(),
      taxNumber: faker.string.numeric(9),
    };
  } else if (partnerCategory === '3') {
    // Group
    specificData = {
      ...specificData,
      groupName: faker.company.name() + ' Group',
      groupType: faker.helpers.arrayElement(['HOUSEHOLD', 'JOINT', 'FAMILY']),
      memberCount: faker.number.int({ min: 2, max: 6 }),
    };
  }
  
  // Combined data for the anchor
  const businessPartnerData = {
    ...baseData,
    ...specificData,
  };
  
  return businessPartnerData;
}

// Generate attached documents for a business partner
export function generateBusinessPartnerAttachments(businessPartnerId: string) {
  // 1. Generate addresses (1-3)
  const addressCount = faker.number.int({ min: 1, max: 3 });
  const addresses: AddressType[] = [];
  
  // Always generate a billing address
  addresses.push(generateAddress('BILL'));
  
  // Add installation address if needed
  if (addressCount > 1) {
    addresses.push(generateAddress('INST'));
  }
  
  // Add mailing address if needed
  if (addressCount > 2) {
    addresses.push(generateAddress('MAIL'));
  }
  
  // 2. Generate contact info (1-4)
  const contactCount = faker.number.int({ min: 1, max: 4 });
  const contacts = generateContactInfo(contactCount);
  
  // 3. Generate contracts (0-3)
  const contractCount = faker.number.int({ min: 0, max: 3 });
  const contracts = generateContracts(contractCount);
  
  // 4. Generate meter installations
  const meters = generateMeterInstallations(contracts);
  
  // 5. Generate bank accounts (0-2)
  const bankCount = faker.number.int({ min: 0, max: 2 });
  const bankAccounts = generateBankAccounts(bankCount);
  
  // 6. Generate credit rating
  const creditRating = generateCreditRating();
  
  return {
    addresses,
    contacts,
    contracts,
    meters,
    bankAccounts,
    creditRating
  };
}

// Seed a specific number of business partners
export async function seedBusinessPartners(count: number, secureFields?: string[]) {
  console.log(`Generating ${count} SAP business partners...`);
  
  // Define fields to encrypt if security is enabled
  const secureFieldsList = secureFields || [
    'firstName', 
    'lastName', 
    'birthDate', 
    'nationalId'
  ];
  
  // Generate the specified number of business partners
  for (let i = 1; i <= count; i++) {
    // Pick a random business partner category with weighted distribution
    // 70% Persons, 25% Organizations, 5% Groups
    let category;
    const rand = Math.random();
    if (rand < 0.7) {
      category = '1'; // Person
    } else if (rand < 0.95) {
      category = '2'; // Organization
    } else {
      category = '3'; // Group
    }
    
    // Generate business partner data
    const businessPartnerData = generateBusinessPartner(category);
    const businessPartnerId = businessPartnerData.id;
    
    // Save the anchor data
    await saveAnchor(
      "business-partner", 
      businessPartnerId, 
      businessPartnerData,
      { 
        secureFields: secureFieldsList, 
        key: "sap-utilities-key" 
      }
    );
    
    // Generate and save attachments
    const attachments = generateBusinessPartnerAttachments(businessPartnerId);
    
    // Attach addresses
    if (attachments.addresses.length > 0) {
      await attachToAnchor(businessPartnerId, "addresses", attachments.addresses);
    }
    
    // Attach contact info
    if (attachments.contacts.length > 0) {
      await attachToAnchor(businessPartnerId, "contact-info", attachments.contacts);
    }
    
    // Attach contracts
    if (attachments.contracts.length > 0) {
      await attachToAnchor(businessPartnerId, "contracts", attachments.contracts);
    }
    
    // Attach meters
    if (attachments.meters.length > 0) {
      await attachToAnchor(businessPartnerId, "meters", attachments.meters);
    }
    
    // Attach bank accounts
    if (attachments.bankAccounts.length > 0) {
      await attachToAnchor(businessPartnerId, "bank-accounts", attachments.bankAccounts, {
        secureFields: ['accountNumber', 'iban'],
        key: "sap-utilities-key"
      });
    }
    
    // Attach credit rating
    await attachToAnchor(businessPartnerId, "credit-rating", attachments.creditRating);
    
    if (i % 10 === 0 || i === count) {
      console.log(`Created ${i}/${count} business partners`);
    }
  }
  
  console.log(`Successfully generated ${count} SAP business partners.`);
}