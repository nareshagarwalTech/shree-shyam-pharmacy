import * as XLSX from 'xlsx';
import { IMPORT_COLUMNS } from './constants';
import { parseFlexibleDate, toISODateString, titleCase, calculateRefillDate } from './utils';
import { isValidIndianPhone } from './whatsapp';

export interface ImportedCustomer {
  name: string;
  phone: string;
  alternate_phone?: string;
  address?: string;
  notes?: string;
  medication?: {
    name: string;
    quantity: number;
    daily_dosage: number;
    start_date: string;
    refill_date: string;
  };
}

export interface ImportResult {
  success: boolean;
  customers: ImportedCustomer[];
  errors: ImportError[];
  warnings: string[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
  value?: string;
}

/**
 * Normalize column name - check aliases
 */
function normalizeColumnName(colName: string): string {
  const normalized = colName.toLowerCase().trim().replace(/\s+/g, '_');
  
  // Check direct match
  if (IMPORT_COLUMNS.required.includes(normalized) || 
      IMPORT_COLUMNS.optional.includes(normalized)) {
    return normalized;
  }
  
  // Check aliases
  for (const [standard, aliases] of Object.entries(IMPORT_COLUMNS.aliases)) {
    if (aliases.includes(normalized)) {
      return standard;
    }
  }
  
  return normalized;
}

/**
 * Parse Excel/CSV file and return customer data
 */
export async function parseImportFile(file: File): Promise<ImportResult> {
  const errors: ImportError[] = [];
  const warnings: string[] = [];
  const customers: ImportedCustomer[] = [];
  
  try {
    // Read file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    
    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { 
      defval: '',
      raw: false 
    });
    
    if (rawData.length === 0) {
      return {
        success: false,
        customers: [],
        errors: [{ row: 0, field: 'file', message: 'File is empty or has no data rows' }],
        warnings: [],
      };
    }
    
    // Normalize column names
    const firstRow = rawData[0];
    const columnMapping: Record<string, string> = {};
    
    for (const key of Object.keys(firstRow)) {
      columnMapping[key] = normalizeColumnName(key);
    }
    
    // Check required columns
    const normalizedColumns = Object.values(columnMapping);
    const missingRequired = IMPORT_COLUMNS.required.filter(
      col => !normalizedColumns.includes(col)
    );
    
    if (missingRequired.length > 0) {
      return {
        success: false,
        customers: [],
        errors: [{
          row: 0,
          field: 'columns',
          message: `Missing required columns: ${missingRequired.join(', ')}. Found columns: ${Object.keys(firstRow).join(', ')}`,
        }],
        warnings: [],
      };
    }
    
    // Process each row
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNum = i + 2; // +2 for 1-indexed and header row
      
      // Map to normalized keys
      const normalizedRow: Record<string, any> = {};
      for (const [original, normalized] of Object.entries(columnMapping)) {
        normalizedRow[normalized] = row[original];
      }
      
      // Extract and validate name
      const name = normalizedRow.name?.toString().trim();
      if (!name) {
        errors.push({ row: rowNum, field: 'name', message: 'Name is required' });
        continue;
      }
      
      // Extract and validate phone
      let phone = normalizedRow.phone?.toString().trim().replace(/[\s\-\(\)]/g, '');
      if (!phone) {
        errors.push({ row: rowNum, field: 'phone', message: 'Phone is required' });
        continue;
      }
      
      if (!isValidIndianPhone(phone)) {
        errors.push({ 
          row: rowNum, 
          field: 'phone', 
          message: 'Invalid phone number (must be 10 digits starting with 6-9)',
          value: phone,
        });
        continue;
      }
      
      // Build customer object
      const customer: ImportedCustomer = {
        name: titleCase(name),
        phone: phone,
      };
      
      // Optional fields
      if (normalizedRow.address) {
        customer.address = normalizedRow.address.toString().trim();
      }
      if (normalizedRow.alternate_phone) {
        customer.alternate_phone = normalizedRow.alternate_phone.toString().trim();
      }
      if (normalizedRow.notes) {
        customer.notes = normalizedRow.notes.toString().trim();
      }
      
      // Medication (if provided)
      if (normalizedRow.medication) {
        const medName = normalizedRow.medication.toString().trim();
        const quantity = parseInt(normalizedRow.quantity) || 30;
        const dailyDosage = parseInt(normalizedRow.daily_dosage) || 1;
        
        let startDate = new Date();
        if (normalizedRow.start_date) {
          const parsed = parseFlexibleDate(normalizedRow.start_date.toString());
          if (parsed) {
            startDate = parsed;
          } else {
            warnings.push(`Row ${rowNum}: Could not parse date "${normalizedRow.start_date}", using today`);
          }
        }
        
        const refillDate = calculateRefillDate(startDate, quantity, dailyDosage);
        
        customer.medication = {
          name: medName,
          quantity,
          daily_dosage: dailyDosage,
          start_date: toISODateString(startDate),
          refill_date: toISODateString(refillDate),
        };
      }
      
      customers.push(customer);
    }
    
    // Check for duplicates
    const phoneCount: Record<string, number> = {};
    customers.forEach(c => {
      phoneCount[c.phone] = (phoneCount[c.phone] || 0) + 1;
    });
    
    const duplicates = Object.entries(phoneCount)
      .filter(([_, count]) => count > 1)
      .map(([phone]) => phone);
    
    if (duplicates.length > 0) {
      warnings.push(`Duplicate phone numbers found: ${duplicates.join(', ')}. Only first entry will be used.`);
      
      // Remove duplicates (keep first)
      const seen = new Set<string>();
      const uniqueCustomers = customers.filter(c => {
        if (seen.has(c.phone)) return false;
        seen.add(c.phone);
        return true;
      });
      
      return {
        success: true,
        customers: uniqueCustomers,
        errors,
        warnings,
      };
    }
    
    return {
      success: true,
      customers,
      errors,
      warnings,
    };
    
  } catch (error) {
    return {
      success: false,
      customers: [],
      errors: [{
        row: 0,
        field: 'file',
        message: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      warnings: [],
    };
  }
}

/**
 * Generate sample CSV for download
 */
export function generateSampleCSV(): string {
  const headers = ['name', 'phone', 'address', 'medication', 'quantity', 'daily_dosage', 'start_date'];
  const sampleRows = [
    ['Ramesh Kumar', '9876543210', 'Kukatpally, Hyderabad', 'Metformin 500mg', '60', '2', '15-01-2024'],
    ['Lakshmi Devi', '9123456789', 'Ameerpet', 'BP Medicine', '30', '1', '20-01-2024'],
    ['Venkat Rao', '9988776655', 'Secunderabad', '', '', '', ''],
  ];
  
  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
  
  return csvContent;
}

/**
 * Download sample CSV
 */
export function downloadSampleCSV(): void {
  const csv = generateSampleCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'customer_import_template.csv';
  link.click();
}
