import { useState } from 'react';
import { Download, FileText, Calendar, Filter, FileSpreadsheet, File } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Select from '../components/ui/Input';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { reportsData } from '../data/dummyData';
import { formatDateTime } from '../utils/helpers';

const ITEMS_PER_PAGE = 6;

const statusVariant = {
  Ready: 'success',
  Processing: 'warning',
  Failed: 'error',
};

export default function Reports() {
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredReports = reportsData.filter((report) => {
    const matchesStatus = !statusFilter || report.status === statusFilter;
    return matchesStatus;
  });

  const totalPages = Math.ceil(filteredReports.length / ITEMS_PER_PAGE);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleExportCSV = () => {
    const headers = ['Name', 'Period', 'Generated', 'Size', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredReports.map((r) => [r.name, r.period, r.generated, r.size, r.status].join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reports.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    alert('PDF export would be implemented with a library like jsPDF or pdfmake');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="page-title">Reports</h2>
          <p className="page-subtitle">Generate and manage your reports</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={FileSpreadsheet} onClick={handleExportCSV}>
            Export CSV
          </Button>
          <Button variant="secondary" icon={File} onClick={handleExportPDF}>
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-50 rounded-lg">
              <FileText className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{reportsData.length}</p>
              <p className="text-sm text-text-secondary">Total Reports</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-lg">
              <FileText className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">
                {reportsData.filter((r) => r.status === 'Ready').length}
              </p>
              <p className="text-sm text-text-secondary">Ready to Download</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 rounded-lg">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">
                {reportsData.filter((r) => r.status === 'Processing').length}
              </p>
              <p className="text-sm text-text-secondary">Processing</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="pl-10"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </Select>
            </div>
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="w-40"
          >
            <option value="">All Status</option>
            <option value="Ready">Ready</option>
            <option value="Processing">Processing</option>
            <option value="Failed">Failed</option>
          </Select>
        </div>
      </Card>

      {/* Reports table */}
      <Card className="overflow-hidden !p-0">
        {paginatedReports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No reports found"
            description="Try adjusting your filter criteria"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-gray-50/50">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Report Name</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Period</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Generated</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Size</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedReports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary-50 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-primary-600" />
                          </div>
                          <p className="text-sm font-medium text-text-primary">{report.name}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{report.period}</td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{formatDateTime(report.generated)}</td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{report.size}</td>
                      <td className="py-4 px-6">
                        <Badge variant={statusVariant[report.status]} dot>{report.status}</Badge>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Download}
                            disabled={report.status !== 'Ready'}
                          >
                            Download
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-border">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredReports.length}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
