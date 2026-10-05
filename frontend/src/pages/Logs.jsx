import { useState, useMemo } from 'react';
import { Search, AlertTriangle, XCircle, Info, Filter } from 'lucide-react';
import Card from '../components/ui/Card';
import Input, { Select } from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { logsData } from '../data/dummyData';

const ITEMS_PER_PAGE = 10;

const levelConfig = {
  INFO: { icon: Info, variant: 'info', color: 'text-blue-600' },
  WARNING: { icon: AlertTriangle, variant: 'warning', color: 'text-amber-600' },
  ERROR: { icon: XCircle, variant: 'error', color: 'text-red-600' },
};

export default function Logs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredLogs = useMemo(() => {
    return logsData.filter((log) => {
      const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.source.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLevel = !levelFilter || log.level === levelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [searchQuery, levelFilter]);

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">System Logs</h2>
        <p className="text-text-secondary mt-1">Monitor system events and troubleshoot issues</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <Select
            value={levelFilter}
            onChange={(e) => { setLevelFilter(e.target.value); setCurrentPage(1); }}
            className="w-40"
          >
            <option value="">All Levels</option>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="ERROR">Error</option>
          </Select>
        </div>
      </Card>

      {/* Logs list */}
      <Card className="overflow-hidden !p-0">
        {paginatedLogs.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="No logs found"
            description="Try adjusting your search or filter criteria"
          />
        ) : (
          <>
            <div className="divide-y divide-border">
              {paginatedLogs.map((log) => {
                const config = levelConfig[log.level] || levelConfig.INFO;
                const Icon = config.icon;
                return (
                  <div key={log.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={config.variant}>{log.level}</Badge>
                          <span className="text-xs text-text-muted">{log.source}</span>
                        </div>
                        <p className="text-sm text-text-primary">{log.message}</p>
                        <p className="text-xs text-text-muted mt-1">{log.timestamp}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t border-border">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredLogs.length}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
