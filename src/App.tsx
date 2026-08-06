import { useState, useEffect } from 'react';
import { supabase, testSupabaseConnection } from '@/supabase-client';
import { generateApprovalScheduleHTML, generateApprovalScheduleExcel, type ApprovalScheduleInput } from '@/md-approval-schedule';
import { Building2, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Loader2, Download } from 'lucide-react';

interface Company { id: string; name: string; logo_url: string | null; }
interface PayrollLine { staffName: string; departmentName: string; pensionEmployee: number; pensionEmployer: number; monthlyTaxPayable: number; otherDeductions: number; netPayment: number; otherEmolument: number; }

function App() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [periodLabel, setPeriodLabel] = useState('JANUARY 2026');
  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [htmlReport, setHtmlReport] = useState<string | null>(null);
  const [excelBuffer, setExcelBuffer] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    async function init() {
      const ok = await testSupabaseConnection();
      setConnected(ok);
      if (ok) {
        const { data, error: queryError } = await supabase.from('companies').select('id, name, logo_url').order('name');
        if (!queryError && data && data.length > 0) { setCompanies(data); setSelectedCompanyId(data[0].id); }
        else { const demo: Company = { id: 'demo-company-001', name: 'Acme Manufacturing Ltd', logo_url: null }; setCompanies([demo]); setSelectedCompanyId(demo.id); }
      } else { const demo: Company = { id: 'demo-company-001', name: 'Acme Manufacturing Ltd', logo_url: null }; setCompanies([demo]); setSelectedCompanyId(demo.id); }
    }
    init();
  }, []);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  async function handleGenerateReport() {
    setGenerating(true); setSuccess(null); setError(null); setHtmlReport(null); setExcelBuffer(null);
    try {
      let lines: PayrollLine[] = [];
      if (connected && selectedCompanyId !== 'demo-company-001') {
        const { data: employees, error: empError } = await supabase.from('employees').select('full_name, department_id, target_salary').eq('company_id', selectedCompanyId).eq('status', 'active');
        if (empError) throw new Error(empError.message);
        if (employees && employees.length > 0) {
          const { data: departments } = await supabase.from('departments').select('id, name').eq('company_id', selectedCompanyId);
          const deptMap = new Map<string, string>();
          (departments || []).forEach((d: { id: string; name: string }) => deptMap.set(d.id, d.name));
          lines = employees.map((emp: { full_name: string; department_id: string | null; target_salary: number }) => {
            const gross = emp.target_salary || 0;
            const pensionEmployee = Math.round(gross * 0.45 * 0.08 * 100) / 100;
            const pensionEmployer = Math.round(gross * 0.45 * 0.10 * 100) / 100;
            const monthlyTaxPayable = Math.round(gross * 0.45 * 0.07 * 100) / 100;
            const otherDeductions = 0;
            const netPayment = Math.round((gross - pensionEmployee - monthlyTaxPayable - otherDeductions) * 100) / 100;
            const otherEmolument = Math.round(gross * 0.55 * 100) / 100;
            return { staffName: emp.full_name, departmentName: emp.department_id ? (deptMap.get(emp.department_id) || 'Unassigned') : 'Unassigned', pensionEmployee, pensionEmployer, monthlyTaxPayable, otherDeductions, netPayment, otherEmolument };
          });
        }
      }
      if (lines.length === 0) {
        lines = [
          { staffName: 'ADEBIYI MICHAEL', departmentName: 'Head Office', pensionEmployee: 22307.33, pensionEmployer: 27884.16, monthlyTaxPayable: 28048.78, otherDeductions: 3485.52, netPayment: 225000.0, otherEmolument: 275000.0 },
          { staffName: 'OKAFOR CHINEDU', departmentName: 'Operations', pensionEmployee: 18000.0, pensionEmployer: 22500.0, monthlyTaxPayable: 19250.5, otherDeductions: 1500.0, netPayment: 180000.0, otherEmolument: 220000.0 },
          { staffName: 'FATIMA BELLO', departmentName: 'Finance', pensionEmployee: 31200.0, pensionEmployer: 39000.0, monthlyTaxPayable: 45600.25, otherDeductions: 5200.0, netPayment: 312000.0, otherEmolument: 388000.0 },
          { staffName: 'EMEKA OBI', departmentName: 'Sales', pensionEmployee: 15600.0, pensionEmployer: 19500.0, monthlyTaxPayable: 14800.0, otherDeductions: 0.0, netPayment: 156000.0, otherEmolument: 190000.0 },
          { staffName: 'GRACE AKINOLA', departmentName: 'Human Resources', pensionEmployee: 26800.0, pensionEmployer: 33500.0, monthlyTaxPayable: 34200.75, otherDeductions: 2800.0, netPayment: 268000.0, otherEmolument: 332000.0 },
        ];
      }
      const input: ApprovalScheduleInput = { companyName: selectedCompany?.name || 'Unknown Company', periodLabel, lines };
      const html = generateApprovalScheduleHTML(input); setHtmlReport(html);
      const buffer = await generateApprovalScheduleExcel(input); setExcelBuffer(buffer);
      setSuccess(`Report generated successfully with ${lines.length} employee(s).`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unknown error occurred'); }
    finally { setGenerating(false); }
  }

  function handleDownloadHTML() {
    if (!htmlReport) return;
    const blob = new Blob([htmlReport], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `approval-schedule-${periodLabel.replace(/\s+/g, '-').toLowerCase()}.html`; a.click(); URL.revokeObjectURL(url);
  }
  function handleDownloadExcel() {
    if (!excelBuffer) return;
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `approval-schedule-${periodLabel.replace(/\s+/g, '-').toLowerCase()}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-700 to-blue-500 flex items-center justify-center"><Building2 className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-lg font-bold text-slate-800 leading-tight">HR Payroll</h1><p className="text-xs text-slate-500">Nigerian Multi-Company Payroll SaaS</p></div>
          </div>
          <div className="flex items-center gap-2">
            {connected === null ? <span className="text-sm text-slate-400 flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />Connecting...</span>
            : connected ? <span className="text-sm text-emerald-600 flex items-center gap-1.5 font-medium"><CheckCircle2 className="w-4 h-4" />Supabase Connected</span>
            : <span className="text-sm text-amber-600 flex items-center gap-1.5 font-medium"><AlertCircle className="w-4 h-4" />Offline Mode</span>}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8"><h2 className="text-2xl font-bold text-slate-800">Payroll Dashboard</h2><p className="text-slate-500 mt-1">Generate MD approval schedules and payroll reports for your company.</p></div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center flex-shrink-0">
              {selectedCompany?.logo_url ? <img src={selectedCompany.logo_url} alt="Logo" className="w-full h-full object-contain rounded-xl" /> : <span className="text-xs text-slate-400 text-center">Logo</span>}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4"><h3 className="text-xl font-bold text-slate-800">{selectedCompany?.name || 'Loading...'}</h3><span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">Active</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-600 mb-1.5">Company</label><select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-600 mb-1.5">Payroll Period</label><input type="text" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="e.g. JANUARY 2026" /></div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <h3 className="text-lg font-bold text-slate-800 mb-1">Generate Payroll Report</h3>
          <p className="text-sm text-slate-500 mb-4">Produces an MD Approval Schedule in both HTML and Excel formats, ready for download and review.</p>
          <button onClick={handleGenerateReport} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-700 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-800 hover:to-blue-700 transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed">
            {generating ? <><Loader2 className="w-5 h-5 animate-spin" />Generating...</> : <><FileSpreadsheet className="w-5 h-5" />Generate Payroll Report</>}
          </button>
        </div>
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1"><p className="text-sm font-medium text-emerald-800">{success}</p>
              <div className="flex gap-3 mt-3">
                <button onClick={handleDownloadHTML} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"><FileText className="w-4 h-4" />Download HTML</button>
                <button onClick={handleDownloadExcel} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"><Download className="w-4 h-4" />Download Excel</button>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div><p className="text-sm font-medium text-red-800">Report generation failed</p><p className="text-sm text-red-600 mt-1">{error}</p></div>
          </div>
        )}
        {htmlReport && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">Report Preview</h3><span className="text-xs text-slate-400">HTML render</span></div>
            <iframe srcDoc={htmlReport} className="w-full" style={{ height: '600px', border: 'none' }} title="Report Preview" />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
