import { useState, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, Database, Download, Upload } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select } from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { dataManagementItems } from '../data/dummyData';
import { formatDate } from '../utils/helpers';

const ITEMS_PER_PAGE = 8;

const statusVariant = {
  Active: 'success',
  Draft: 'warning',
  Archived: 'default',
};

export default function DataManagement() {
  const [items, setItems] = useState(dataManagementItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalState, setModalState] = useState({ type: null, isOpen: false });
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, item: null });
  const [formData, setFormData] = useState({ name: '', category: '', status: 'Draft' });
  const [formErrors, setFormErrors] = useState({});

  const categories = [...new Set(items.map((item) => item.category))];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      const matchesStatus = !statusFilter || item.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [items, searchQuery, categoryFilter, statusFilter]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const openModal = (type, item = null) => {
    if (type === 'add') {
      setFormData({ name: '', category: '', status: 'Draft' });
    } else if (type === 'edit' && item) {
      setFormData({ name: item.name, category: item.category, status: item.status });
    }
    setSelectedItem(item);
    setFormErrors({});
    setModalState({ type, isOpen: true });
  };

  const closeModal = () => {
    setModalState({ type: null, isOpen: false });
    setSelectedItem(null);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.category.trim()) errors.category = 'Category is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (modalState.type === 'add') {
      const newItem = {
        id: Math.max(...items.map((i) => i.id)) + 1,
        ...formData,
        owner: 'Admin User',
        lastModified: new Date().toISOString().split('T')[0],
        size: '0 MB',
      };
      setItems([newItem, ...items]);
    } else if (modalState.type === 'edit') {
      setItems(items.map((i) => (i.id === selectedItem.id ? { ...i, ...formData } : i)));
    }
    closeModal();
  };

  const handleDelete = () => {
    setItems(items.filter((i) => i.id !== deleteConfirm.item.id));
    setDeleteConfirm({ isOpen: false, item: null });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="page-title">Data Management</h2>
          <p className="page-subtitle">Manage your data files and resources</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={Upload}>Import</Button>
          <Button variant="secondary" icon={Download}>Export</Button>
          <Button icon={Plus} onClick={() => openModal('add')}>Add Data</Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search data..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              className="w-40"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-32"
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden !p-0">
        {paginatedItems.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No data found"
            description="Try adjusting your search or filter criteria"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-gray-50/50">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Name</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Category</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Owner</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Modified</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{item.name}</p>
                          <p className="text-xs text-text-muted">{item.size}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <Badge variant="info">{item.category}</Badge>
                      </td>
                      <td className="py-4 px-6">
                        <Badge variant={statusVariant[item.status]} dot>{item.status}</Badge>
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{item.owner}</td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{formatDate(item.lastModified)}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setSelectedItem(item); setModalState({ type: 'view', isOpen: true }); }}
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openModal('edit', item)}
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ isOpen: true, item })}
                            className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
                totalItems={filteredItems.length}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            </div>
          </>
        )}
      </Card>

      {/* View/Add/Edit Modal */}
      <Modal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={
          modalState.type === 'add' ? 'Add New Data' :
          modalState.type === 'edit' ? 'Edit Data' :
          'Data Details'
        }
        size="md"
      >
        {modalState.type === 'view' && selectedItem ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">{selectedItem.name}</h3>
              <p className="text-text-secondary">{selectedItem.category}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Status</p>
                <Badge variant={statusVariant[selectedItem.status]} dot>{selectedItem.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Size</p>
                <p className="text-sm font-medium text-text-primary">{selectedItem.size}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Owner</p>
                <p className="text-sm font-medium text-text-primary">{selectedItem.owner}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Last Modified</p>
                <p className="text-sm font-medium text-text-primary">{formatDate(selectedItem.lastModified)}</p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Data Name"
              placeholder="Enter data name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={formErrors.name}
            />
            <Input
              label="Category"
              placeholder="Enter category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              error={formErrors.category}
            />
            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="Active">Active</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
            </Select>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                {modalState.type === 'add' ? 'Add Data' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, item: null })}
        onConfirm={handleDelete}
        title="Delete Data"
        message={`Are you sure you want to delete "${deleteConfirm.item?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
