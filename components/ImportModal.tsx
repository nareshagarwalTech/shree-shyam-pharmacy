'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { parseImportFile, downloadSampleCSV, ImportedCustomer, ImportResult } from '@/lib/import';
import { X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface ImportModalProps {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'complete';

export default function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    // Parse the file
    const result = await parseImportFile(selectedFile);
    setImportResult(result);
    setStep('preview');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;

    // Check file type
    const validTypes = ['.xlsx', '.xls', '.csv'];
    const isValid = validTypes.some(ext => droppedFile.name.toLowerCase().endsWith(ext));
    if (!isValid) {
      alert('Please upload an Excel (.xlsx, .xls) or CSV file');
      return;
    }

    setFile(droppedFile);
    const result = await parseImportFile(droppedFile);
    setImportResult(result);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!importResult || importResult.customers.length === 0) return;

    setStep('importing');
    setImporting(true);
    setImportProgress(0);
    
    let successCount = 0;
    const total = importResult.customers.length;

    for (let i = 0; i < importResult.customers.length; i++) {
      const customer = importResult.customers[i];
      
      try {
        // Check if customer with same phone exists
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', customer.phone)
          .single();

        let customerId: string;

        if (existing) {
          // Update existing customer
          customerId = existing.id;
        } else {
          // Insert new customer
          const { data: newCustomer, error } = await supabase
            .from('customers')
            .insert({
              name: customer.name,
              phone: customer.phone,
              alternate_phone: customer.alternate_phone || null,
              address: customer.address || null,
              notes: customer.notes || null,
            })
            .select()
            .single();

          if (error) throw error;
          customerId = newCustomer.id;
        }

        // Insert medication if present
        if (customer.medication) {
          await supabase.from('medications').insert({
            customer_id: customerId,
            name: customer.medication.name,
            quantity: customer.medication.quantity,
            daily_dosage: customer.medication.daily_dosage,
            start_date: customer.medication.start_date,
            refill_date: customer.medication.refill_date,
          });
        }

        successCount++;
      } catch (error) {
        console.error(`Error importing customer ${customer.name}:`, error);
      }

      setImportProgress(Math.round(((i + 1) / total) * 100));
    }

    setImportedCount(successCount);
    setImporting(false);
    setStep('complete');
  };

  const handleReset = () => {
    setFile(null);
    setImportResult(null);
    setStep('upload');
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-overlay absolute inset-0 bg-black/50" onClick={onClose}></div>
      
      <div className="modal-content relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-display font-bold text-gray-900">
            Import Customers
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Drop your Excel or CSV file here
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-600 rounded-lg text-sm font-medium">
                  <Upload className="w-4 h-4" />
                  Select File
                </span>
              </div>

              {/* Sample Download */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-700">Need a template?</p>
                  <p className="text-sm text-gray-500">Download our sample CSV with correct format</p>
                </div>
                <button
                  onClick={downloadSampleCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
              </div>

              {/* Format Help */}
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-2">Required columns:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-500">
                  <li><code className="bg-gray-100 px-1 rounded">name</code> - Customer full name</li>
                  <li><code className="bg-gray-100 px-1 rounded">phone</code> - 10-digit mobile number</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Optional columns:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-500">
                  <li><code className="bg-gray-100 px-1 rounded">address</code>, <code className="bg-gray-100 px-1 rounded">medication</code>, <code className="bg-gray-100 px-1 rounded">quantity</code>, <code className="bg-gray-100 px-1 rounded">daily_dosage</code>, <code className="bg-gray-100 px-1 rounded">start_date</code></li>
                </ul>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && importResult && (
            <div className="space-y-6">
              {/* File Info */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <FileSpreadsheet className="w-8 h-8 text-primary-500" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{file?.name}</p>
                  <p className="text-sm text-gray-500">
                    {importResult.customers.length} customers found
                  </p>
                </div>
                <button onClick={handleReset} className="text-sm text-primary-600 hover:underline">
                  Change file
                </button>
              </div>

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-red-700">
                      {importResult.errors.length} error(s) found
                    </span>
                  </div>
                  <ul className="text-sm text-red-600 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>...and {importResult.errors.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {importResult.warnings.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <span className="font-medium text-amber-700">Warnings</span>
                  </div>
                  <ul className="text-sm text-amber-600 space-y-1">
                    {importResult.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Table */}
              {importResult.customers.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-700 mb-3">Preview (first 5 rows)</h3>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Phone</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Medication</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importResult.customers.slice(0, 5).map((c, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2">{c.name}</td>
                            <td className="px-3 py-2">{c.phone}</td>
                            <td className="px-3 py-2">{c.medication?.name || '-'}</td>
                            <td className="px-3 py-2">{c.medication?.quantity || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importResult.customers.length > 5 && (
                    <p className="text-sm text-gray-500 mt-2">
                      ...and {importResult.customers.length - 5} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="py-8 text-center">
              <Loader2 className="w-12 h-12 text-primary-500 mx-auto mb-4 animate-spin" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Importing customers...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-3 max-w-xs mx-auto">
                <div 
                  className="bg-primary-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">{importProgress}%</p>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <p className="text-lg font-medium text-gray-700 mb-2">
                Import Complete!
              </p>
              <p className="text-gray-500">
                Successfully imported {importedCount} customers
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
          {step === 'upload' && (
            <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
          )}
          
          {step === 'preview' && (
            <>
              <button onClick={handleReset} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!importResult || importResult.customers.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Import {importResult?.customers.length || 0} Customers
              </button>
            </>
          )}
          
          {step === 'complete' && (
            <button
              onClick={() => onSuccess(importedCount)}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
